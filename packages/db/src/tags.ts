import { asc, eq, inArray, sql } from "drizzle-orm";

import { centsToAmount } from "@pnl/money";
import { summarizeTagRows } from "@pnl/engine";
import { accounts, categories, tags, transactionTags, transactions } from "@pnl/types";

import { batchChunked } from "./batch";
import { loadFxContext } from "./fx";

import type { TagReportRow } from "@pnl/engine";
import type { Tag, TagReport, TagReportByNameResult, TagReportTransaction } from "@pnl/types";
import type { PnlDb } from "./client";

/**
 * All tags for the given transactions, keyed by transaction id. Batched at 90
 * ids per statement to stay under D1's 100-bound-param limit.
 */
export async function tagsByTransactionId(db: PnlDb, txIds: string[]): Promise<Map<string, Tag[]>> {
  const tagsByTx = new Map<string, Tag[]>();
  if (txIds.length === 0) return tagsByTx;

  type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
  const tagRowsBatched = (await batchChunked(db, txIds, 90, (chunk) =>
    db
      .select({
        transactionId: transactionTags.transactionId,
        id: tags.id,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt
      })
      .from(transactionTags)
      .innerJoin(tags, eq(tags.id, transactionTags.tagId))
      .where(inArray(transactionTags.transactionId, chunk))
  )) as TagJoinRow[][];
  for (const row of tagRowsBatched.flat()) {
    const { transactionId, ...t } = row;
    const list = tagsByTx.get(transactionId) ?? [];
    list.push(t);
    tagsByTx.set(transactionId, list);
  }
  return tagsByTx;
}

/**
 * The single tag-report builder (previously duplicated verbatim in the tRPC
 * router and the MCP path). Totals are converted to the base currency and
 * follow the direction-from-category rule (ADR-0002); the transaction list
 * stays in each row's original currency.
 */
export async function buildTagReport(db: PnlDb, tag: Tag): Promise<TagReport> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      description: transactions.description,
      amountCents: transactions.amountCents,
      currency: accounts.currency,
      type: transactions.type,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
      sourceFile: transactions.sourceFile,
      rawRow: transactions.rawRow,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryGroupType: categories.groupType
    })
    .from(transactions)
    .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactionTags.tagId, tag.id))
    .orderBy(transactions.date);

  const tagsByTx = await tagsByTransactionId(
    db,
    rows.map((r) => r.id)
  );

  const fx = await loadFxContext(
    db,
    rows.map((r) => ({ month: r.month, currency: r.currency }))
  );

  const summaryRows: TagReportRow[] = rows.map((r) => ({
    date: r.date,
    cents: fx.toBaseCents(r.amountCents, r.month, r.currency),
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    groupType: r.categoryGroupType as TagReportRow["groupType"]
  }));
  const summary = summarizeTagRows(summaryRows);

  const txTransactions: TagReportTransaction[] = rows.map(
    ({ categoryName: _n, categoryGroupType: _g, month: _m, amountCents, ...t }) => ({
      ...t,
      amount: centsToAmount(amountCents),
      tags: tagsByTx.get(t.id) ?? [tag]
    })
  );

  return {
    tag,
    currency: fx.baseCurrency,
    totalIncome: summary.totalIncome,
    totalSpend: summary.totalSpend,
    net: summary.net,
    byCategory: summary.byCategory,
    transactions: txTransactions,
    dateRange: summary.dateRange
  };
}

export async function listTagNames(db: PnlDb): Promise<string[]> {
  const rows = await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name));
  return rows.map((r) => r.name);
}

export async function findTagByName(db: PnlDb, name: string): Promise<Tag | null> {
  const [tag] = await db
    .select()
    .from(tags)
    .where(sql`LOWER(${tags.name}) LIKE LOWER('%' || ${name} || '%')`)
    .orderBy(sql`LENGTH(${tags.name}) ASC`)
    .limit(1);
  return tag ?? null;
}

export async function getTagReportByName(db: PnlDb, name: string): Promise<TagReportByNameResult | null> {
  const availableTags = await listTagNames(db);
  const tag = await findTagByName(db, name);
  if (!tag) return null;

  const report = await buildTagReport(db, tag);
  return { report, availableTags };
}
