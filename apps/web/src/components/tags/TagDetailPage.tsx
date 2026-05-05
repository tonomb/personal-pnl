import { Link } from "@tanstack/react-router";
import { Loader2Icon } from "lucide-react";

import { TagPill } from "@/components/tags/TagPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/pnl-helpers";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

import type { TagReportCategoryBreakdown } from "@pnl/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(y!, m! - 1, d!));
}

function groupBySection(items: TagReportCategoryBreakdown[]) {
  return {
    income: items.filter((c) => c.groupType === "INCOME"),
    fixed: items.filter((c) => c.groupType === "FIXED"),
    variable: items.filter((c) => c.groupType === "VARIABLE")
  };
}

function sumTotal(items: TagReportCategoryBreakdown[]): number {
  return items.reduce((acc, c) => acc + c.total, 0);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeaderRow({ label }: { label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={2}
        className="bg-muted/60 py-1.5 pl-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function CategorySection({ label, items }: { label: string; items: TagReportCategoryBreakdown[] }) {
  if (items.length === 0) return null;
  const subtotal = sumTotal(items);
  return (
    <>
      <SectionHeaderRow label={label} />
      {items.map((cat) => (
        <TableRow key={cat.categoryId}>
          <TableCell className="pl-6">{cat.categoryName}</TableCell>
          <TableCell className="text-right tabular-nums">{formatCurrency(cat.total)}</TableCell>
        </TableRow>
      ))}
      <TableRow className="font-semibold hover:bg-muted/30">
        <TableCell className="bg-muted/30 pl-3">Total {label}</TableCell>
        <TableCell className="bg-muted/30 text-right tabular-nums">{formatCurrency(subtotal)}</TableCell>
      </TableRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = { tagId: string };

export function TagDetailPage({ tagId }: Props) {
  const { data: report, isLoading, isError } = trpc.tags.getReport.useQuery({ tagId });

  if (isLoading) {
    return (
      <div data-testid="tag-detail-loading" className="flex h-full items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="text-muted-foreground">Tag not found.</p>
        <Link to="/tags" className="text-sm text-muted-foreground hover:text-foreground">
          ← All Tags
        </Link>
      </div>
    );
  }

  const { income, fixed, variable } = groupBySection(report.byCategory);
  const reversedTx = [...report.transactions].reverse();

  return (
    <main className="flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <Link to="/tags" className="mb-3 block text-sm text-muted-foreground hover:text-foreground">
          ← All Tags
        </Link>
        <div className="mb-4">
          <TagPill tag={report.tag} className="text-sm" />
        </div>
        <div className="flex flex-wrap gap-8">
          <div>
            <p className="text-xs text-muted-foreground">Spend</p>
            <p data-testid="tag-detail-spend" className="text-lg font-semibold tabular-nums text-destructive">
              {formatCurrency(report.totalSpend)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Income</p>
            <p data-testid="tag-detail-income" className="text-lg font-semibold tabular-nums text-income">
              {formatCurrency(report.totalIncome)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net</p>
            <p
              data-testid="tag-detail-net"
              className={cn(
                "text-lg font-semibold tabular-nums",
                report.net > 0 ? "text-income" : report.net < 0 ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {formatCurrency(report.net)}
            </p>
          </div>
          {report.dateRange && (
            <div>
              <p className="text-xs text-muted-foreground">Date Range</p>
              <p className="text-sm font-medium">
                {formatDate(report.dateRange.from)} – {formatDate(report.dateRange.to)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="px-6 py-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Category Breakdown</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.byCategory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="py-4 text-center text-sm text-muted-foreground">
                  No categorized transactions
                </TableCell>
              </TableRow>
            ) : (
              <>
                <CategorySection label="INCOME" items={income} />
                <CategorySection label="FIXED" items={fixed} />
                <CategorySection label="VARIABLE" items={variable} />
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Transaction list */}
      <div className="px-6 pb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Transactions</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reversedTx.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="tabular-nums text-muted-foreground">{tx.date}</TableCell>
                <TableCell>{tx.description}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {tx.tags.map((tag) => (
                      <TagPill key={tag.id} tag={tag} />
                    ))}
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-medium",
                    tx.type === "CREDIT" ? "text-income" : "text-destructive"
                  )}
                >
                  {tx.type === "CREDIT" ? "+" : "−"}
                  {formatCurrency(tx.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
