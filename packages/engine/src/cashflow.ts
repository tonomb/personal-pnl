import { centsToAmount } from "@pnl/money";

import { expenseCells, incomeCells, inMonth, sumCents } from "./rollup-cell";

import type { CashflowTrendPoint } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

/**
 * Income vs expenses per month over the given period. Direction comes from
 * the category's group (ADR-0002, via the rollup-cell selectors); months with
 * no data render as zeros.
 */
export function buildCashflowTrend(periodMonths: string[], cells: RollupCell[]): CashflowTrendPoint[] {
  return periodMonths.map((month) => {
    const monthCells = inMonth(cells, month);
    const incomeCents = sumCents(incomeCells(monthCells));
    const expenseCents = sumCents(expenseCells(monthCells));
    return {
      month,
      income: centsToAmount(incomeCents),
      expenses: centsToAmount(expenseCents),
      net: centsToAmount(incomeCents - expenseCents)
    };
  });
}
