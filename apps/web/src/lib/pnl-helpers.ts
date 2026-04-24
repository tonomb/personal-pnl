import type { MonthlyPnL, PnLReport } from "@pnl/types";

export type TableSection = "income" | "fixed" | "variable";

export type CategoryRow = { categoryId: number; categoryName: string };

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
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

/** Union of all categories for a section across all visible months. */
export function collectCategoryRows(months: MonthlyPnL[], section: TableSection): CategoryRow[] {
  const seen = new Map<number, string>();
  for (const m of months) {
    for (const item of m[section].items) {
      if (!seen.has(item.categoryId)) seen.set(item.categoryId, item.categoryName);
    }
  }
  return [...seen.entries()].map(([categoryId, categoryName]) => ({ categoryId, categoryName }));
}

/** Amount for a single (category, month) cell. Returns 0 if absent. */
export function getCategoryMonthTotal(
  months: MonthlyPnL[],
  section: TableSection,
  categoryId: number,
  month: string
): number {
  const m = months.find((x) => x.month === month);
  if (!m) return 0;
  return m[section].items.find((x) => x.categoryId === categoryId)?.total ?? 0;
}

/** YTD total for a category across all visible months. */
export function getCategoryYtd(months: MonthlyPnL[], section: TableSection, categoryId: number): number {
  return months.reduce((sum, m) => {
    return sum + (m[section].items.find((x) => x.categoryId === categoryId)?.total ?? 0);
  }, 0);
}

/** Tailwind class for savings rate color coding. */
export function savingsRateClass(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate < 0.1) return "text-destructive";
  if (rate < 0.2) return "text-amber-600";
  return "text-income";
}

/** Build CSV content string from report data. */
export function buildCsvContent(report: PnLReport, visibleMonths: MonthlyPnL[]): string {
  const monthHeaders = visibleMonths.map((m) => formatMonthShort(m.month));
  const rows: string[][] = [["Category", ...monthHeaders, "YTD"]];

  const SECTIONS: Array<{ label: string; key: TableSection }> = [
    { label: "INCOME", key: "income" },
    { label: "FIXED EXPENSES", key: "fixed" },
    { label: "VARIABLE EXPENSES", key: "variable" }
  ];

  for (const { label, key } of SECTIONS) {
    rows.push([label, ...Array<string>(visibleMonths.length + 1).fill("")]);
    const cats = collectCategoryRows(visibleMonths, key);
    for (const cat of cats) {
      const monthValues = visibleMonths.map((m) =>
        getCategoryMonthTotal(visibleMonths, key, cat.categoryId, m.month).toFixed(2)
      );
      rows.push([cat.categoryName, ...monthValues, getCategoryYtd(visibleMonths, key, cat.categoryId).toFixed(2)]);
    }
    const sectionYtd = visibleMonths.reduce((s, m) => s + m[key].total, 0).toFixed(2);
    rows.push([`Total ${label}`, ...visibleMonths.map((m) => m[key].total.toFixed(2)), sectionYtd]);
    rows.push([]);
  }

  rows.push(["NET", ...visibleMonths.map((m) => m.net.toFixed(2)), report.ytdNet.toFixed(2)]);
  rows.push([
    "SAVINGS RATE",
    ...visibleMonths.map((m) => (m.savingsRate != null ? formatPercent(m.savingsRate) : "")),
    report.avgMonthlySavingsRate != null ? formatPercent(report.avgMonthlySavingsRate) : ""
  ]);

  return rows
    .map((r) => r.map((cell) => (/[,"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","))
    .join("\n");
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
