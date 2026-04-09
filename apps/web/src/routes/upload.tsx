import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/upload')({
	component: UploadPage,
})

function UploadPage() {
	return (
		<main className="p-8">
			<h1 className="text-2xl font-bold">Upload</h1>
			<p className="text-muted-foreground">Upload a bank statement CSV file.</p>
		</main>
	)
}
