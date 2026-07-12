import { centsToAmount } from "@pnl/money";

import type { CashflowTrendPoint } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

/**
 * Income vs expenses per month over the given period. Direction comes from
 * the category's group (ADR-0002); months with no data render as zeros.
 */
export function buildCashflowTrend(periodMonths: string[], cells: RollupCell[]): CashflowTrendPoint[] {
  const byMonth = new Map<string, { incomeCents: number; expenseCents: number }>();
  for (const m of periodMonths) byMonth.set(m, { incomeCents: 0, expenseCents: 0 });

  for (const cell of cells) {
    const bucket = byMonth.get(cell.month);
    if (!bucket || cell.categoryId === null) continue;
    if (cell.groupType === "INCOME") {
      bucket.incomeCents += cell.cents;
    } else if (cell.groupType === "FIXED" || cell.groupType === "VARIABLE") {
      bucket.expenseCents += cell.cents;
    }
  }

  return periodMonths.map((m) => {
    const b = byMonth.get(m)!;
    return {
      month: m,
      income: centsToAmount(b.incomeCents),
      expenses: centsToAmount(b.expenseCents),
      net: centsToAmount(b.incomeCents - b.expenseCents)
    };
  });
}
