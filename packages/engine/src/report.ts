import { centsToAmount, round4, sumAmounts, toCents } from "@pnl/money";

import { buildMonthlyPnL } from "./monthly-pnl";
import { countUncategorized, monthsIn } from "./rollup-cell";

import type { MonthlyPnL, PnLReport } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

export function buildPnlReport(cells: RollupCell[], currency: string): PnLReport {
  const months = monthsIn(cells);
  const monthlyData = months.map((m) => buildMonthlyPnL(m, cells, currency));

  let ytdIncomeCents = 0;
  let ytdExpensesCents = 0;
  for (const m of monthlyData) {
    ytdIncomeCents += toCents(m.income.total);
    ytdExpensesCents += toCents(m.fixed.total) + toCents(m.variable.total);
  }

  const rates = monthlyData.map((m) => m.savingsRate).filter((r): r is number => r !== null);
  const avgMonthlySavingsRate = rates.length === 0 ? null : round4(rates.reduce((s, r) => s + r, 0) / rates.length);

  return {
    currency,
    months: monthlyData,
    ytdIncome: centsToAmount(ytdIncomeCents),
    ytdExpenses: centsToAmount(ytdExpensesCents),
    ytdNet: centsToAmount(ytdIncomeCents - ytdExpensesCents),
    avgMonthlySavingsRate,
    uncategorizedCount: countUncategorized(cells)
  };
}

export type TableSection = "income" | "fixed" | "variable";

export type CategoryRow = { categoryId: number; categoryName: string };

/** Union of all categories for a section across the given months. */
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

/** Total for a category across the given months, summed exactly in cents. */
export function sumCategoryAcrossMonths(months: MonthlyPnL[], section: TableSection, categoryId: number): number {
  const cents = months.reduce((sum, m) => {
    return sum + toCents(m[section].items.find((x) => x.categoryId === categoryId)?.total ?? 0);
  }, 0);
  return centsToAmount(cents);
}

/**
 * Section total across the given months, summed exactly in cents. The UI must
 * use this (never a float reduce) so on-screen totals match the CSV export.
 */
export function sumSectionAcrossMonths(months: MonthlyPnL[], section: TableSection): number {
  return sumAmounts(months.map((m) => m[section].total));
}

/** NET across the given months, summed exactly in cents. */
export function sumNetAcrossMonths(months: MonthlyPnL[]): number {
  return sumAmounts(months.map((m) => m.net));
}

function formatPercentCell(rate: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(rate);
}

function escapeCsvCell(cell: string): string {
  return /[,"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/**
 * CSV export of the P&L over the given months (typically the report's visible
 * subset). All sums happen here, in cents — the UI only downloads the string.
 *
 * Deliberately lives in the engine rather than the web app: exact totals
 * require folding cents, and the engine is the only layer that has them
 * (DTOs carry rounded major units, ADR-0001).
 */
export function buildPnlReportCsv(months: MonthlyPnL[], monthHeaders: string[]): string {
  const rows: string[][] = [["Category", ...monthHeaders, "YTD"]];

  const SECTIONS: Array<{ label: string; key: TableSection }> = [
    { label: "INCOME", key: "income" },
    { label: "FIXED EXPENSES", key: "fixed" },
    { label: "VARIABLE EXPENSES", key: "variable" }
  ];

  for (const { label, key } of SECTIONS) {
    rows.push([label, ...Array<string>(months.length + 1).fill("")]);
    for (const cat of collectCategoryRows(months, key)) {
      const monthValues = months.map((m) => getCategoryMonthTotal(months, key, cat.categoryId, m.month).toFixed(2));
      rows.push([cat.categoryName, ...monthValues, sumCategoryAcrossMonths(months, key, cat.categoryId).toFixed(2)]);
    }
    const sectionYtd = sumSectionAcrossMonths(months, key);
    rows.push([`Total ${label}`, ...months.map((m) => m[key].total.toFixed(2)), sectionYtd.toFixed(2)]);
    rows.push([]);
  }

  rows.push(["NET", ...months.map((m) => m.net.toFixed(2)), sumNetAcrossMonths(months).toFixed(2)]);

  const rates = months.map((m) => m.savingsRate).filter((r): r is number => r !== null);
  const avgRate = rates.length === 0 ? null : rates.reduce((s, r) => s + r, 0) / rates.length;
  rows.push([
    "SAVINGS RATE",
    ...months.map((m) => (m.savingsRate != null ? formatPercentCell(m.savingsRate) : "")),
    avgRate != null ? formatPercentCell(avgRate) : ""
  ]);

  return rows.map((r) => r.map(escapeCsvCell).join(",")).join("\n");
}
