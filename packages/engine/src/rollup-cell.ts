// ---------------------------------------------------------------------------
// The Rollup Cell is the single row contract between the data layer and the
// engine: every money aggregate is a pure fold over cells. Cells arrive
// already converted to the base currency (integer cents) — the engine is
// currency-agnostic and only stamps the currency code onto the DTOs it emits.
// ---------------------------------------------------------------------------

import type { CategoryGroup } from "@pnl/types";

export type { CategoryGroup } from "@pnl/types";

export type RollupCell = {
  month: string; // YYYY-MM
  categoryId: number | null; // null = uncategorized
  categoryName: string | null;
  groupType: CategoryGroup | null;
  accountId: string;
  accountName: string;
  /** Sum of transaction magnitudes in BASE-currency integer cents (ADR-0001/0003). */
  cents: number;
  /** Number of transactions aggregated into this cell. */
  rowCount: number;
};

// ---------------------------------------------------------------------------
// Direction selectors — the ONE place the direction-from-category rule
// (ADR-0002) is written down. Every report composes these instead of
// re-implementing the groupType ladder.
// ---------------------------------------------------------------------------

/** Does this Group land on the income side of the P&L? (ADR-0002) */
export function isIncomeGroup(group: CategoryGroup | null | undefined): group is "INCOME" {
  return group === "INCOME";
}

/** Does this Group land on the expense side of the P&L? (ADR-0002) */
export function isExpenseGroup(group: CategoryGroup | null | undefined): group is "FIXED" | "VARIABLE" {
  return group === "FIXED" || group === "VARIABLE";
}

/** A cell that is categorized (never an uncategorized bucket). */
export type CategorizedCell = RollupCell & { categoryId: number; groupType: CategoryGroup };
export type IncomeCell = CategorizedCell & { groupType: "INCOME" };
export type ExpenseCell = CategorizedCell & { groupType: "FIXED" | "VARIABLE" };

/** Cells for one month. */
export function inMonth<C extends { month: string }>(cells: C[], month: string): C[] {
  return cells.filter((c) => c.month === month);
}

/** Categorized cells of one Group. */
export function inGroup(cells: RollupCell[], group: CategoryGroup): CategorizedCell[] {
  return cells.filter((c): c is CategorizedCell => c.groupType === group && c.categoryId !== null);
}

/** Cells that count toward income (ADR-0002). */
export function incomeCells(cells: RollupCell[]): IncomeCell[] {
  return cells.filter((c): c is IncomeCell => isIncomeGroup(c.groupType) && c.categoryId !== null);
}

/** Cells that count toward expenses: FIXED + VARIABLE (ADR-0002). */
export function expenseCells(cells: RollupCell[]): ExpenseCell[] {
  return cells.filter((c): c is ExpenseCell => isExpenseGroup(c.groupType) && c.categoryId !== null);
}

/** Total base-currency cents across cells. */
export function sumCents(cells: Array<{ cents: number }>): number {
  return cells.reduce((sum, c) => sum + c.cents, 0);
}

export type CategoryCents<G extends CategoryGroup = CategoryGroup> = {
  categoryId: number;
  categoryName: string;
  groupType: G;
  cents: number;
};

/** Fold cells into one bucket per category (insertion order preserved). */
export function sumByCategory<C extends CategorizedCell>(cells: C[]): Array<CategoryCents<C["groupType"]>> {
  const byCategory = new Map<number, CategoryCents<C["groupType"]>>();
  for (const cell of cells) {
    const existing = byCategory.get(cell.categoryId);
    if (existing) {
      existing.cents += cell.cents;
    } else {
      byCategory.set(cell.categoryId, {
        categoryId: cell.categoryId,
        categoryName: cell.categoryName ?? "",
        groupType: cell.groupType,
        cents: cell.cents
      });
    }
  }
  return [...byCategory.values()];
}

/** Transactions with no category, across the given cells (optionally one month). */
export function countUncategorized(cells: RollupCell[], month?: string): number {
  return cells.reduce((sum, c) => {
    if (c.categoryId !== null) return sum;
    if (month !== undefined && c.month !== month) return sum;
    return sum + c.rowCount;
  }, 0);
}

/** Total transaction count across cells (optionally restricted to one month). */
export function countTransactions(cells: RollupCell[], month?: string): number {
  return cells.reduce((sum, c) => {
    if (month !== undefined && c.month !== month) return sum;
    return sum + c.rowCount;
  }, 0);
}

/** Distinct months present in the cells, ascending. */
export function monthsIn(cells: RollupCell[]): string[] {
  return [...new Set(cells.map((c) => c.month))].sort();
}
