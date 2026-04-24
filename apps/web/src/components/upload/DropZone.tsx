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
		if (!fileList) return
		const all = Array.from(fileList)
		const accepted = all.filter((f) => /\.(csv|xlsx|xls)$/i.test(f.name))
		if (accepted.length > 0) onFiles(accepted)
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
				Drop CSV or XLSX files here or click to browse
			</p>
			<input
				ref={inputRef}
				type="file"
				accept=".csv,.xlsx,.xls"
				multiple
				className="hidden"
				disabled={disabled}
				onChange={(e) => handleFiles(e.target.files)}
			/>
		</div>
	)
}
