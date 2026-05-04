import { Link } from "@tanstack/react-router";

import { TagPill } from "@/components/tags/TagPill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

import type { TagWithCount } from "@pnl/types";

function TagCard({ tag }: { tag: TagWithCount }) {
  const createdLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(tag.createdAt)
  );
  return (
    <Link
      to="/tags/$tagId"
      params={{ tagId: tag.id }}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full cursor-pointer transition-colors hover:bg-muted/50">
        <CardContent className="flex flex-col gap-2 pb-4 pt-4">
          <TagPill tag={tag} />
          <p className="text-sm text-muted-foreground">
            {tag.transactionCount} {tag.transactionCount === 1 ? "transaction" : "transactions"}
          </p>
          <p className="text-xs text-muted-foreground">Created {createdLabel}</p>
        </CardContent>
      </Card>
    </Link>
  );
}

export function TagsIndexPage() {
  const { data: tags, isLoading } = trpc.tags.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000
  });

  if (isLoading) {
    return (
      <main className="p-6">
        <h1 className="mb-1 text-xl font-semibold">Tags</h1>
        <p className="mb-6 text-sm text-muted-foreground">Track spending across trips, events, and projects.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} data-testid="tag-skeleton" className="h-24 rounded-xl" />
          ))}
        </div>
      </main>
    );
  }

  if (!tags || tags.length === 0) {
    return (
      <main className="flex h-full flex-col">
        <div className="border-b px-6 pb-4 pt-6">
          <h1 className="text-xl font-semibold">Tags</h1>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <p className="text-muted-foreground">No tags yet — create your first tag in the categorization screen.</p>
          <Link
            to="/categorize"
            className="inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted hover:text-foreground"
          >
            Go to Categorize
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Tags</h1>
      <p className="mb-6 text-sm text-muted-foreground">Track spending across trips, events, and projects.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {tags.map((tag) => (
          <TagCard key={tag.id} tag={tag} />
        ))}
      </div>
    </main>
  );
}
