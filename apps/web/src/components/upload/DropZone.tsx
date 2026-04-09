import { UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'

interface DropZoneProps {
	onFiles: (files: File[]) => void
	disabled?: boolean
}

export function DropZone({ onFiles, disabled }: DropZoneProps) {
	const [isDragging, setIsDragging] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	function handleFiles(fileList: FileList | null) {
		console.log('[DropZone] handleFiles called, fileList:', fileList)
		if (!fileList) return
		const all = Array.from(fileList)
		console.log('[DropZone] all files:', all.map((f) => f.name))
		const csvFiles = all.filter((f) => f.name.toLowerCase().endsWith('.csv'))
		console.log('[DropZone] csv files:', csvFiles.map((f) => f.name))
		if (csvFiles.length > 0) onFiles(csvFiles)
	}

	return (
		<div
			role="button"
			tabIndex={0}
			aria-label="Drop zone"
			onClick={() => inputRef.current?.click()}
			onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
			onDragOver={(e) => {
				e.preventDefault()
				setIsDragging(true)
			}}
			onDragLeave={() => setIsDragging(false)}
			onDrop={(e) => {
				console.log('[DropZone] onDrop fired')
				e.preventDefault()
				setIsDragging(false)
				handleFiles(e.dataTransfer.files)
			}}
			className={[
				'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-12 transition-colors',
				isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
				disabled ? 'pointer-events-none opacity-50' : '',
			].join(' ')}
		>
			<UploadCloud className="text-muted-foreground h-10 w-10" />
			<p className="text-muted-foreground text-sm">
				Drop CSV files here or click to browse
			</p>
			<input
				ref={inputRef}
				type="file"
				accept=".csv"
				multiple
				className="hidden"
				disabled={disabled}
				onChange={(e) => handleFiles(e.target.files)}
			/>
		</div>
	)
}
