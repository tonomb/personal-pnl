import type { TransactionWithCategory } from "@pnl/types";

/** What a merchant's transactions are categorized as, taken together. */
export type MerchantCategory =
  | { kind: "uncategorized" }
  | { kind: "mixed" }
  | { kind: "single"; name: string; color: string | null };

export type MerchantRow = {
  kind: "merchant-header";
  merchantKey: string;
  txIds: string[];
  displayName: string;
  /** Debit/credit subtotals per original currency — never summed across currencies. */
  totals: Array<{ currency: string; debits: number; credits: number }>;
  category: MerchantCategory;
};

export type TxRow = {
  kind: "transaction";
  tx: TransactionWithCategory;
};

export type FlatRow = MerchantRow | TxRow;

export function merchantCategory(txs: TransactionWithCategory[]): MerchantCategory {
  const first = txs[0];
  if (!first) return { kind: "uncategorized" };
  if (txs.some((t) => t.categoryId !== first.categoryId)) return { kind: "mixed" };
  if (first.categoryId == null) return { kind: "uncategorized" };
  return { kind: "single", name: first.categoryName ?? "", color: first.categoryColor ?? null };
}

/**
 * The transactions a keyboard action (categorize, tag) applies to: the current
 * selection if there is one, otherwise the row under the cursor — every
 * transaction of a merchant header, or the single transaction of a row.
 */
export function classifyTargetIds(rows: FlatRow[], cursorIndex: number, selectedIds: ReadonlySet<string>): string[] {
  if (selectedIds.size > 0) return [...selectedIds];
  const row = rows[cursorIndex];
  if (!row) return [];
  return row.kind === "merchant-header" ? [...row.txIds] : [row.tx.id];
}
