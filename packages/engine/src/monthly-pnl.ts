import { centsToAmount, ratioOrNull } from "@pnl/money";

import { inGroup, inMonth, sumByCategory } from "./rollup-cell";

import type { CategoryTotal, KpiSummary, MonthGroup, MonthlyPnL } from "@pnl/types";
import type { CategoryCents, RollupCell } from "./rollup-cell";

// The category's groupType is the source of truth for P&L direction (ADR-0002,
// encoded once in the rollup-cell selectors): a category's total is the sum of
// every transaction in it regardless of the bank-reported DEBIT/CREDIT type.
// The bank type is unreliable across statement formats (LAG-46), and gating on
// it silently dropped amounts.

function toGroup(buckets: CategoryCents[]): { group: MonthGroup; cents: number } {
  let cents = 0;
  const items: CategoryTotal[] = [];
  for (const bucket of buckets) {
    cents += bucket.cents;
    items.push({
      categoryId: bucket.categoryId,
      categoryName: bucket.categoryName,
      total: centsToAmount(bucket.cents)
    });
  }
  return { group: { total: centsToAmount(cents), items }, cents };
}

export function buildMonthlyPnL(month: string, cells: RollupCell[], currency: string): MonthlyPnL {
  const monthCells = inMonth(cells, month);
  const income = toGroup(sumByCategory(inGroup(monthCells, "INCOME")));
  const fixed = toGroup(sumByCategory(inGroup(monthCells, "FIXED")));
  const variable = toGroup(sumByCategory(inGroup(monthCells, "VARIABLE")));
  const ignored = toGroup(sumByCategory(inGroup(monthCells, "IGNORED")));

  const netCents = income.cents - fixed.cents - variable.cents;

  return {
    month,
    currency,
    income: income.group,
    fixed: fixed.group,
    variable: variable.group,
    ignored: ignored.group,
    net: centsToAmount(netCents),
    savingsRate: ratioOrNull(netCents, income.cents)
  };
}

export function getSavingsRateBenchmark(rate: number | null): KpiSummary["savingsLabel"] {
  if (rate === null) return null;
  if (rate >= 0.2) return "HEALTHY";
  if (rate >= 0.1) return "WATCH";
  return "DANGER";
}
