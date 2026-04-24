import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/pnl")({
  component: PnlPage
});

function PnlPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">P&amp;L</h1>
      <p className="text-muted-foreground">Your monthly profit &amp; loss statement.</p>
    </main>
  );
}
