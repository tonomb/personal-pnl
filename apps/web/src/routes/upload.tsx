import { createFileRoute } from '@tanstack/react-router'
import Papa from 'papaparse'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ColumnMapper, type MappingState } from '@/components/upload/ColumnMapper'
import { DropZone } from '@/components/upload/DropZone'
import { SheetSelector } from '@/components/upload/SheetSelector'
import { generateFingerprint, generateTransactionId, parseAmount } from '@/lib/csv'
import { getSheetNames, xlsxToCsvString } from '@/lib/xlsx'
import { trpc } from '@/lib/trpc'

import type { NewColumnMapping, NewTransaction } from '@pnl/types'

export const Route = createFileRoute('/upload')({
	component: UploadPage,
})

// ---------------------------------------------------------------------------
// File status discriminated union
// ---------------------------------------------------------------------------

type FileStatus =
	| { phase: 'parsing' }
	| { phase: 'mapping'; headers: string[]; rawRows: Record<string, string>[]; fingerprint: string }
	| { phase: 'ready'; transactions: NewTransaction[]; mapping: NewColumnMapping }
	| { phase: 'uploading' }
	| { phase: 'done'; inserted: number; duplicates: number }
	| { phase: 'error'; message: string }

const BADGE_LABELS: Record<FileStatus['phase'], string> = {
	parsing: 'Parsing…',
	mapping: 'Needs mapping',
	ready: 'Ready',
	uploading: 'Uploading…',
	done: 'Done',
	error: 'Error',
}

const BADGE_VARIANTS: Record<
	FileStatus['phase'],
	'default' | 'secondary' | 'destructive' | 'outline'
> = {
	parsing: 'secondary',
	mapping: 'outline',
	ready: 'default',
	uploading: 'secondary',
	done: 'default',
	error: 'destructive',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTransactions(
	rawRows: Record<string, string>[],
	mapping: MappingState,
	sourceFile: string,
): NewTransaction[] {
	const seen = new Set<string>()
	const result: NewTransaction[] = []

	for (const row of rawRows) {
		const date = (row[mapping.dateCol!] ?? '').trim()
		const description = (row[mapping.descriptionCol!] ?? '').trim()
		if (!date || !description) continue

		let amount: number
		let type: 'DEBIT' | 'CREDIT'

		if (mapping.useDebitCredit) {
			const debitVal = parseFloat((row[mapping.debitCol!] ?? '').replace(/[$,()]/g, '')) || 0
			const creditVal = parseFloat((row[mapping.creditCol!] ?? '').replace(/[$,()]/g, '')) || 0
			if (debitVal > 0) {
				amount = debitVal
				type = 'DEBIT'
			} else {
				amount = creditVal
				type = 'CREDIT'
			}
		} else {
			const parsed = parseAmount(row[mapping.amountCol!] ?? '0')
			amount = parsed.amount
			type = parsed.type
		}

		const id = generateTransactionId(date, description, amount)
		if (seen.has(id)) continue
		seen.add(id)

		result.push({
			id,
			date,
			description,
			amount,
			type,
			sourceFile,
			rawRow: JSON.stringify(row),
			createdAt: new Date().toISOString(),
		})
	}

	return result
}

function toDbMapping(mapping: MappingState, fingerprint: string): NewColumnMapping {
	return {
		fileFingerprint: fingerprint,
		dateCol: mapping.dateCol!,
		descriptionCol: mapping.descriptionCol!,
		amountCol: mapping.amountCol ?? null,
		debitCol: mapping.debitCol ?? null,
		creditCol: mapping.creditCol ?? null,
	}
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function UploadPage() {
	const [fileMap, setFileMap] = useState<Map<string, FileStatus>>(new Map())
	const [sheetPicker, setSheetPicker] = useState<{ file: File; sheetNames: string[] } | null>(null)
	const uploadMutation = trpc.transactions.upload.useMutation()
	const getMappingUtils = trpc.useUtils()

	function updateFile(name: string, status: FileStatus | undefined) {
		setFileMap((prev) => {
			const next = new Map(prev)
			if (status === undefined) {
				next.delete(name)
			} else {
				next.set(name, status)
			}
			return next
		})
	}

	async function applyParsedRows(
		file: File,
		data: Record<string, string>[],
		headers: string[],
	) {
		const fingerprint = generateFingerprint(headers)

		let existing = null
		try {
			existing = await getMappingUtils.transactions.getMapping.fetch(
				{ fingerprint },
				{ staleTime: 0 },
			)
		} catch {
			// worker not reachable — treat as unknown fingerprint
		}

		if (existing) {
			const syntheticMapping: MappingState = {
				dateCol: existing.dateCol,
				descriptionCol: existing.descriptionCol,
				amountCol: existing.amountCol ?? undefined,
				debitCol: existing.debitCol ?? undefined,
				creditCol: existing.creditCol ?? undefined,
				useDebitCredit: Boolean(existing.debitCol && existing.creditCol),
			}
			const txs = buildTransactions(data, syntheticMapping, file.name)
			const dbMapping = toDbMapping(syntheticMapping, fingerprint)
			updateFile(file.name, { phase: 'ready', transactions: txs, mapping: dbMapping })
			toast(`Auto-mapped "${file.name}" from previous upload`)
		} else {
			updateFile(file.name, { phase: 'mapping', headers, rawRows: data, fingerprint })
		}
	}

	async function parseCsvAndContinue(csvStringOrFile: string | File, file: File) {
		let parsed: { data: Record<string, string>[]; headers: string[] }
		try {
			parsed = await new Promise((resolve, reject) => {
				Papa.parse<Record<string, string>>(csvStringOrFile as string, {
					header: true,
					skipEmptyLines: true,
					complete: ({ data, meta }) => resolve({ data, headers: meta.fields ?? [] }),
					error: reject,
				})
			})
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to parse'
			updateFile(file.name, { phase: 'error', message })
			toast.error(`"${file.name}": ${message}`)
			return
		}
		await applyParsedRows(file, parsed.data, parsed.headers)
	}

	async function processFile(file: File) {
		updateFile(file.name, { phase: 'parsing' })

		const ext = file.name.split('.').pop()?.toLowerCase()

		if (ext === 'xlsx' || ext === 'xls') {
			let buffer: ArrayBuffer
			try {
				buffer = await file.arrayBuffer()
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Could not read file'
				updateFile(file.name, { phase: 'error', message })
				toast.error(`"${file.name}": ${message}`)
				return
			}

			let sheetNames: string[]
			try {
				sheetNames = getSheetNames(buffer)
			} catch {
				const message = 'Could not read Excel file. It may be malformed or password-protected.'
				updateFile(file.name, { phase: 'error', message })
				toast.error(`"${file.name}": ${message}`)
				return
			}

			if (sheetNames.length === 0) {
				const message = 'The Excel file contains no sheets.'
				updateFile(file.name, { phase: 'error', message })
				toast.error(`"${file.name}": ${message}`)
				return
			}

			// Always show SheetSelector so the user can set the header row
			setSheetPicker({ file, sheetNames })
			return
		} else {
			await parseCsvAndContinue(file, file)
		}
	}

	async function handleSheetSelect(sheetName: string, headerRow: number) {
		if (!sheetPicker) return
		const { file } = sheetPicker
		setSheetPicker(null)

		let buffer: ArrayBuffer
		try {
			buffer = await file.arrayBuffer()
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Could not read file'
			updateFile(file.name, { phase: 'error', message })
			toast.error(`"${file.name}": ${message}`)
			return
		}

		let csvString: string
		try {
			csvString = xlsxToCsvString(buffer, sheetName, headerRow)
		} catch {
			const message = 'Could not read Excel file. It may be malformed or password-protected.'
			updateFile(file.name, { phase: 'error', message })
			toast.error(`"${file.name}": ${message}`)
			return
		}

		await parseCsvAndContinue(csvString, file)
	}

	async function handleFiles(dropped: File[]) {
		for (const file of dropped) {
			await processFile(file)
		}
	}

	function handleMappingConfirm(fileName: string, mapping: MappingState) {
		const status = fileMap.get(fileName)
		if (status?.phase !== 'mapping') return

		const txs = buildTransactions(status.rawRows, mapping, fileName)
		const dbMapping = toDbMapping(mapping, status.fingerprint)
		updateFile(fileName, { phase: 'ready', transactions: txs, mapping: dbMapping })
	}

	async function handleUploadAll() {
		for (const [fileName, status] of fileMap.entries()) {
			if (status.phase !== 'ready') continue
			updateFile(fileName, { phase: 'uploading' })
			try {
				const result = await uploadMutation.mutateAsync({
					transactions: status.transactions,
					sourceFile: fileName,
					mapping: status.mapping,
				})
				updateFile(fileName, {
					phase: 'done',
					inserted: result.inserted,
					duplicates: result.duplicates,
				})
				toast(
					`"${fileName}": inserted ${result.inserted}, skipped ${result.duplicates} duplicates`,
				)
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Upload failed'
				updateFile(fileName, { phase: 'error', message })
				toast.error(`"${fileName}": ${message}`)
			}
		}
	}

	const hasReady = [...fileMap.values()].some((s) => s.phase === 'ready')

	return (
		<main className="mx-auto max-w-3xl space-y-6 p-8">
			<div>
				<h1 className="text-2xl font-bold">Upload</h1>
				<p className="text-muted-foreground">Upload one or more bank statement CSV or XLSX files.</p>
			</div>

			<DropZone onFiles={handleFiles} />

			{sheetPicker && (
				<SheetSelector
					sheetNames={sheetPicker.sheetNames}
					onSelect={handleSheetSelect}
					onCancel={() => {
						updateFile(sheetPicker.file.name, undefined)
						setSheetPicker(null)
					}}
				/>
			)}

			{fileMap.size > 0 && (
				<ul className="space-y-4">
					{[...fileMap.entries()].map(([name, status]) => (
						<li key={name} className="space-y-2">
							<div className="flex items-center gap-2">
								<span className="font-mono text-sm">{name}</span>
								<Badge variant={BADGE_VARIANTS[status.phase]}>
									{BADGE_LABELS[status.phase]}
								</Badge>
								{status.phase === 'done' && (
									<span className="text-muted-foreground text-xs">
										{status.inserted} inserted · {status.duplicates} duplicates
									</span>
								)}
								{status.phase === 'error' && (
									<span className="text-destructive text-xs">{status.message}</span>
								)}
							</div>

							{status.phase === 'mapping' && (
								<ColumnMapper
									fileName={name}
									headers={status.headers}
									previewRows={status.rawRows
										.slice(0, 5)
										.map((row) => status.headers.map((h) => row[h] ?? ''))}
									onConfirm={(mapping) => handleMappingConfirm(name, mapping)}
									onCancel={() => updateFile(name, undefined)}
								/>
							)}
						</li>
					))}
				</ul>
			)}

			{hasReady && (
				<Button onClick={handleUploadAll} disabled={uploadMutation.isPending}>
					Upload All
				</Button>
			)}
		</main>
	)
}
