import { buildPnlReportCsv, sumCategoryAcrossMonths } from "@pnl/engine";

import type { TableSection } from "@pnl/engine";
import type { MonthlyPnL } from "@pnl/types";

export { collectCategoryRows, getCategoryMonthTotal } from "@pnl/engine";
export type { CategoryRow, TableSection } from "@pnl/engine";

/**
 * Format a major-unit amount in the currency the report is denominated in
 * (aggregates carry their base currency; transaction rows their account's).
 */
export function formatCurrency(amount: number, currency: string = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

export function formatPercent(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(rate);
}

export function formatMonthShort(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short" }).format(new Date(y!, m! - 1, 1));
}

export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(y!, m! - 1, 1));
}

/** YTD total for a category across the visible months (exact, summed in cents by the engine). */
export function getCategoryYtd(months: MonthlyPnL[], section: TableSection, categoryId: number): number {
  return sumCategoryAcrossMonths(months, section, categoryId);
}

/** Tailwind class for savings rate color coding. */
export function savingsRateClass(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate < 0.1) return "text-destructive";
  if (rate < 0.2) return "text-amber-600";
  return "text-income";
}

/** CSV content for the visible months — all sums happen in the engine. */
export function buildCsvContent(visibleMonths: MonthlyPnL[]): string {
  return buildPnlReportCsv(
    visibleMonths,
    visibleMonths.map((m) => formatMonthShort(m.month))
  );
}

export function triggerCsvDownload(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
