import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/categorize')({
	component: CategorizePage,
})

function CategorizePage() {
	return (
		<main className="p-8">
			<h1 className="text-2xl font-bold">Categorize</h1>
			<p className="text-muted-foreground">Assign categories to your transactions.</p>
		</main>
	)
}
