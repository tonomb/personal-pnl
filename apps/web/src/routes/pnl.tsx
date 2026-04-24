import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { KpiCards } from "@/components/pnl/KpiCards";
import { UncategorizedBanner } from "@/components/pnl/UncategorizedBanner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  buildCsvContent,
  collectCategoryRows,
  formatCurrency,
  formatMonthLabel,
  formatMonthShort,
  formatPercent,
  getCategoryMonthTotal,
  getCategoryYtd,
  savingsRateClass,
  triggerCsvDownload
} from "@/lib/pnl-helpers";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

import type { MonthlyPnL, TransactionWithCategory } from "@pnl/types";

export const Route = createFileRoute("/pnl")({
  component: PnlPage
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeaderRow({ label, colCount }: { label: string; colCount: number }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={colCount}
        className="sticky left-0 bg-muted/60 py-1.5 pl-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}

function CategoryTransactionRows({
  categoryId,
  focusedMonth,
  colCount
}: {
  categoryId: number;
  focusedMonth: string | undefined;
  colCount: number;
}) {
  const { data, isLoading } = trpc.transactions.list.useQuery({
    categoryId,
    month: focusedMonth,
    limit: 500,
    offset: 0
  });

  if (isLoading) {
    return (
      <tr>
        <td colSpan={colCount} className="bg-muted/10 py-2 pl-10 text-xs text-muted-foreground">
          <Loader2Icon className="inline size-3 animate-spin" /> Loading…
        </td>
      </tr>
    );
  }

  const rows: TransactionWithCategory[] = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={colCount} className="bg-muted/10 py-2 pl-10 text-xs italic text-muted-foreground">
          No transactions
        </td>
      </tr>
    );
  }

  return (
    <>
      {rows.map((tx) => (
        <tr key={tx.id} className="border-b border-border/40 bg-muted/10 text-xs">
          <td className="sticky left-0 z-10 bg-muted/10 py-1.5 pl-10 pr-2 text-muted-foreground">{tx.date}</td>
          <td colSpan={colCount - 2} className="py-1.5 px-2 text-muted-foreground">
            {tx.description}
          </td>
          <td className="py-1.5 pr-2 text-right tabular-nums text-foreground">{formatCurrency(tx.amount)}</td>
        </tr>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-muted-foreground">No transactions found for this year.</p>
      <Link
        to="/upload"
        className="inline-flex h-7 items-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted hover:text-foreground"
      >
        Upload transactions
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table rendering helpers
// ---------------------------------------------------------------------------

function renderSection(
  sectionKey: "income" | "fixed" | "variable",
  sectionLabel: string,
  visibleMonths: MonthlyPnL[],
  expandedCategories: Set<number>,
  toggleCategory: (id: number) => void,
  focusedMonth: string | undefined
) {
  const colCount = visibleMonths.length + 2;
  const categories = collectCategoryRows(visibleMonths, sectionKey);

  return (
    <>
      <SectionHeaderRow label={sectionLabel} colCount={colCount} />

      {categories.map((cat) => {
        const isExpanded = expandedCategories.has(cat.categoryId);

        return (
          <Fragment key={cat.categoryId}>
            <TableRow className="cursor-pointer" onClick={() => toggleCategory(cat.categoryId)}>
              <TableCell className="sticky left-0 z-10 bg-background pl-3">
                <ChevronRightIcon
                  className={cn(
                    "mr-1.5 inline size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
                    isExpanded && "rotate-90"
                  )}
                />
                {cat.categoryName}
              </TableCell>

              {visibleMonths.map((m) => {
                const val = getCategoryMonthTotal(visibleMonths, sectionKey, cat.categoryId, m.month);
                return (
                  <TableCell
                    key={m.month}
                    className={cn("text-right tabular-nums", val === 0 && "text-muted-foreground/50")}
                  >
                    {formatCurrency(val)}
                  </TableCell>
                );
              })}

              <TableCell className="text-right tabular-nums font-medium">
                {formatCurrency(getCategoryYtd(visibleMonths, sectionKey, cat.categoryId))}
              </TableCell>
            </TableRow>

            {isExpanded && (
              <CategoryTransactionRows categoryId={cat.categoryId} focusedMonth={focusedMonth} colCount={colCount} />
            )}
          </Fragment>
        );
      })}

      {/* Section subtotal */}
      <TableRow className="font-semibold hover:bg-muted/30">
        <TableCell className="sticky left-0 z-10 bg-muted/30 pl-3">Total {sectionLabel}</TableCell>
        {visibleMonths.map((m) => (
          <TableCell key={m.month} className="bg-muted/30 text-right tabular-nums">
            {formatCurrency(m[sectionKey].total)}
          </TableCell>
        ))}
        <TableCell className="bg-muted/30 text-right tabular-nums">
          {formatCurrency(visibleMonths.reduce((s, m) => s + m[sectionKey].total, 0))}
        </TableCell>
      </TableRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

function PnlPage() {
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [focusedMonth, setFocusedMonth] = useState<string | undefined>(undefined);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const { data: report, isLoading } = trpc.pnl.getReport.useQuery({ year });

  const visibleMonths = useMemo(() => {
    if (!report) return [];
    if (focusedMonth) return report.months.filter((m) => m.month === focusedMonth);
    return report.months;
  }, [report, focusedMonth]);

  const availableMonths = useMemo(() => report?.months.map((m) => m.month) ?? [], [report]);

  function handleMonthChange(val: string) {
    setFocusedMonth(val === "all" ? undefined : val);
    setExpandedCategories(new Set());
  }

  function handleYearChange(val: string) {
    setYear(Number(val));
    setFocusedMonth(undefined);
    setExpandedCategories(new Set());
  }

  function toggleCategory(id: number) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleExport() {
    if (!report) return;
    const csv = buildCsvContent(report, visibleMonths);
    const filename = `pnl-${focusedMonth ?? year}.csv`;
    triggerCsvDownload(csv, filename);
  }

  const isEmpty = !isLoading && report && report.months.length === 0;

  return (
    <main className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div>
          <h1 className="text-xl font-bold">P&amp;L</h1>
          <p className="text-xs text-muted-foreground">Profit &amp; loss by category</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Year selector */}
          <Select value={String(year)} onValueChange={(val) => val && handleYearChange(val)}>
            <SelectTrigger className="h-8 w-24 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month selector */}
          <Select value={focusedMonth ?? "all"} onValueChange={(val) => handleMonthChange(val ?? "all")}>
            <SelectTrigger className="h-8 w-36 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {availableMonths.map((m) => (
                <SelectItem key={m} value={m}>
                  {formatMonthLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Export */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-sm"
            disabled={!report || visibleMonths.length === 0}
            onClick={handleExport}
          >
            <DownloadIcon className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <KpiCards months={report?.months ?? []} focusedMonth={focusedMonth} isReportLoading={isLoading} />

      {/* Uncategorized warning */}
      {report && <UncategorizedBanner count={report.uncategorizedCount} />}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {isEmpty && <EmptyState />}

      {/* Table */}
      {!isLoading && report && visibleMonths.length > 0 && (
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 min-w-48 bg-background">Category</TableHead>
                {visibleMonths.map((m) => (
                  <TableHead key={m.month} className="min-w-28 text-right tabular-nums">
                    {formatMonthShort(m.month)}
                  </TableHead>
                ))}
                <TableHead className="min-w-28 text-right tabular-nums font-semibold">YTD</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {renderSection("income", "Income", visibleMonths, expandedCategories, toggleCategory, focusedMonth)}
              {renderSection(
                "fixed",
                "Fixed Expenses",
                visibleMonths,
                expandedCategories,
                toggleCategory,
                focusedMonth
              )}
              {renderSection(
                "variable",
                "Variable Expenses",
                visibleMonths,
                expandedCategories,
                toggleCategory,
                focusedMonth
              )}
            </TableBody>

            <TableFooter>
              {/* NET row */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-muted/50 font-bold">NET</TableCell>
                {visibleMonths.map((m) => (
                  <TableCell
                    key={m.month}
                    className={cn(
                      "text-right tabular-nums font-bold",
                      m.net > 0 ? "text-income" : m.net < 0 ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrency(m.net)}
                  </TableCell>
                ))}
                <TableCell
                  className={cn(
                    "text-right tabular-nums font-bold",
                    report.ytdNet > 0 ? "text-income" : report.ytdNet < 0 ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {formatCurrency(report.ytdNet)}
                </TableCell>
              </TableRow>

              {/* SAVINGS RATE row */}
              <TableRow>
                <TableCell className="sticky left-0 z-10 bg-muted/50 font-semibold">Savings Rate</TableCell>
                {visibleMonths.map((m) => (
                  <TableCell key={m.month} className={cn("text-right tabular-nums", savingsRateClass(m.savingsRate))}>
                    {m.savingsRate != null ? formatPercent(m.savingsRate) : "—"}
                  </TableCell>
                ))}
                <TableCell className={cn("text-right tabular-nums", savingsRateClass(report.avgMonthlySavingsRate))}>
                  {report.avgMonthlySavingsRate != null ? formatPercent(report.avgMonthlySavingsRate) : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </main>
  );
}
