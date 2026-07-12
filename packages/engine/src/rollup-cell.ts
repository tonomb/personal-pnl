// ---------------------------------------------------------------------------
// The Rollup Cell is the single row contract between the data layer and the
// engine: every money aggregate is a pure fold over cells. Cells arrive
// already converted to the base currency (integer cents) — the engine is
// currency-agnostic and only stamps the currency code onto the DTOs it emits.
// ---------------------------------------------------------------------------

export type CategoryGroup = "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";

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
