import { centsToAmount, ratioOrNull } from "@pnl/money";

import type { CategoryTotal, KpiSummary, MonthGroup, MonthlyPnL } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

type CategoryBucket = {
  categoryId: number;
  categoryName: string;
  cents: number;
};

type MonthCents = {
  income: Map<number, CategoryBucket>;
  fixed: Map<number, CategoryBucket>;
  variable: Map<number, CategoryBucket>;
  ignored: Map<number, CategoryBucket>;
};

// The category's groupType is the source of truth for P&L direction (ADR-0002):
// a category's total is the sum of every transaction in it regardless of the
// bank-reported DEBIT/CREDIT type. The bank type is unreliable across statement
// formats (LAG-46), and gating on it silently dropped amounts.
function bucketMonth(month: string, cells: RollupCell[]): MonthCents {
  const buckets: MonthCents = { income: new Map(), fixed: new Map(), variable: new Map(), ignored: new Map() };
  for (const cell of cells) {
    if (cell.month !== month || cell.categoryId === null) continue;
    const map =
      cell.groupType === "INCOME"
        ? buckets.income
        : cell.groupType === "FIXED"
          ? buckets.fixed
          : cell.groupType === "VARIABLE"
            ? buckets.variable
            : cell.groupType === "IGNORED"
              ? buckets.ignored
              : null;
    if (!map) continue;
    const existing = map.get(cell.categoryId);
    if (existing) {
      existing.cents += cell.cents;
    } else {
      map.set(cell.categoryId, {
        categoryId: cell.categoryId,
        categoryName: cell.categoryName ?? "",
        cents: cell.cents
      });
    }
  }
  return buckets;
}

function toGroup(map: Map<number, CategoryBucket>): { group: MonthGroup; cents: number } {
  let cents = 0;
  const items: CategoryTotal[] = [];
  for (const bucket of map.values()) {
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
  const buckets = bucketMonth(month, cells);
  const income = toGroup(buckets.income);
  const fixed = toGroup(buckets.fixed);
  const variable = toGroup(buckets.variable);
  const ignored = toGroup(buckets.ignored);

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
