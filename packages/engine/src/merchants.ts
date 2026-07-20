// ---------------------------------------------------------------------------
// The Merchant Cell is the merchant-grain sibling of the Rollup Cell: one
// month × merchant bucket of summed transaction magnitudes, already converted
// to base-currency integer cents. Produced next to the Rollup Cell (the db
// rollup module); merchant reports are pure folds over Merchant Cells.
// ---------------------------------------------------------------------------

import { centsToAmount } from "@pnl/money";

import type { TopMerchantRow } from "@pnl/types";

export type MerchantCell = {
  /** Grouping key: the statement description, raw or normalized by the producer. */
  merchant: string;
  month: string; // YYYY-MM
  /** Sum of transaction magnitudes in BASE-currency integer cents (ADR-0001/0003). */
  cents: number;
  /** Number of transactions aggregated into this cell. */
  rowCount: number;
};

export type MerchantTotal = { merchant: string; count: number; cents: number };

/** Fold cells into one bucket per merchant (insertion order preserved). */
export function summarizeMerchants(cells: MerchantCell[]): MerchantTotal[] {
  const byMerchant = new Map<string, MerchantTotal>();
  for (const cell of cells) {
    const bucket = byMerchant.get(cell.merchant);
    if (bucket) {
      bucket.count += cell.rowCount;
      bucket.cents += cell.cents;
    } else {
      byMerchant.set(cell.merchant, { merchant: cell.merchant, count: cell.rowCount, cents: cell.cents });
    }
  }
  return [...byMerchant.values()];
}

/** Merchants ranked by total volume, largest first, capped at `limit`. */
export function rankMerchantsByVolume(cells: MerchantCell[], limit: number): TopMerchantRow[] {
  return summarizeMerchants(cells)
    .map(({ cents, ...row }) => ({ ...row, total: centsToAmount(cents) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
