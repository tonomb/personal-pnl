import { inArray } from "drizzle-orm";

import { toCents } from "@pnl/money";
import { transactions } from "@pnl/types";

import { batchChunked } from "./batch";

import type { TransactionUpload } from "@pnl/types";
import type { PnlDb } from "./client";

export type InsertTransactionsResult = {
  inserted: number;
  duplicates: number;
};

/**
 * Ingestion: dedupe by id, convert major-unit amounts to integer cents
 * (ADR-0001 — the only place upload precision is decided), and insert within
 * D1's bound-parameter limits.
 */
export async function insertTransactions(
  db: PnlDb,
  txs: TransactionUpload[],
  accountId: string
): Promise<InsertTransactionsResult> {
  if (txs.length === 0) return { inserted: 0, duplicates: 0 };

  const submittedIds = txs.map((tx) => tx.id);
  const dedupeResults = (await batchChunked(db, submittedIds, 90, (chunk) =>
    db.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, chunk))
  )) as Array<Array<{ id: string }>>;
  const existingIds = new Set<string>();
  for (const rows of dedupeResults) {
    for (const row of rows) existingIds.add(row.id);
  }

  const newRows = txs
    .filter((tx) => !existingIds.has(tx.id))
    .map(({ amount, ...tx }) => ({ ...tx, amountCents: toCents(amount), accountId }));

  // 10 columns per row → 9 rows/statement keeps headroom under 100 params.
  await batchChunked(db, newRows, 9, (rows) => db.insert(transactions).values(rows));

  return { inserted: newRows.length, duplicates: existingIds.size };
}
