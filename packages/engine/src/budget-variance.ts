import { centsToAmount, round2 } from "@pnl/money";

import type { BudgetVarianceLabel, BudgetVarianceRow } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

// Threshold for the variance label: ±10% relative to the trailing average.
const BUDGET_VARIANCE_THRESHOLD = 0.1;

/**
 * Compare each expense category's spend in `month` against its average over
 * the trailing months. `cells` must cover the trailing months plus `month`;
 * spend is every transaction in FIXED/VARIABLE categories (ADR-0002).
 */
export function buildBudgetVarianceRows(
  month: string,
  trailingMonthCount: number,
  cells: RollupCell[]
): BudgetVarianceRow[] {
  type Bucket = {
    categoryId: number;
    categoryName: string;
    groupType: "FIXED" | "VARIABLE";
    trailingCents: number;
    actualCents: number;
  };
  const byCategory = new Map<number, Bucket>();

  for (const cell of cells) {
    if (cell.categoryId === null) continue;
    if (cell.groupType !== "FIXED" && cell.groupType !== "VARIABLE") continue;
    const bucket: Bucket = byCategory.get(cell.categoryId) ?? {
      categoryId: cell.categoryId,
      categoryName: cell.categoryName ?? "",
      groupType: cell.groupType,
      trailingCents: 0,
      actualCents: 0
    };
    if (cell.month === month) {
      bucket.actualCents += cell.cents;
    } else {
      bucket.trailingCents += cell.cents;
    }
    byCategory.set(cell.categoryId, bucket);
  }

  return [...byCategory.values()]
    .map((b) => {
      const trailingAvg = round2(centsToAmount(b.trailingCents) / trailingMonthCount);
      const actual = centsToAmount(b.actualCents);
      const variance = round2(actual - trailingAvg);
      const status: BudgetVarianceLabel = (() => {
        if (trailingAvg === 0) return actual === 0 ? "ON_TRACK" : "OVER";
        const ratio = variance / trailingAvg;
        if (ratio > BUDGET_VARIANCE_THRESHOLD) return "OVER";
        if (ratio < -BUDGET_VARIANCE_THRESHOLD) return "UNDER";
        return "ON_TRACK";
      })();
      return {
        categoryId: b.categoryId,
        categoryName: b.categoryName,
        groupType: b.groupType,
        trailingAvg,
        actual,
        variance,
        status
      };
    })
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}
