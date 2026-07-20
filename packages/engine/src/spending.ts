import { centsToAmount } from "@pnl/money";

import { expenseCells, sumByCategory } from "./rollup-cell";

import type { SpendingByCategoryRow } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

/**
 * Expense-category totals over the given cells, largest first. Spend is every
 * transaction in FIXED/VARIABLE categories — the bank DEBIT/CREDIT type is
 * ignored (ADR-0002, via the rollup-cell selectors).
 */
export function buildSpendingByCategoryRows(cells: RollupCell[]): SpendingByCategoryRow[] {
  return sumByCategory(expenseCells(cells))
    .map(({ cents, ...row }) => ({ ...row, total: centsToAmount(cents) }))
    .sort((a, b) => b.total - a.total);
}
