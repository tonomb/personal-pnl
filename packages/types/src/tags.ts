import Decimal from "decimal.js";
import { asc, eq, inArray, sql } from "drizzle-orm";

import { add, subtract, toStorable } from "@pnl/money";

import type { PnlDb } from "./pnl";
import { categories, tags, transactionTags, transactions } from "./schema";
import type { Tag } from "./schema";
import type { TagReport, TagReportCategoryBreakdown, TagReportTransaction } from "./trpc";

function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

async function buildTagReport(db: PnlDb, tag: Tag): Promise<TagReport> {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      sourceFile: transactions.sourceFile,
      rawRow: transactions.rawRow,
      createdAt: transactions.createdAt,
      categoryName: categories.name,
      categoryGroupType: categories.groupType
    })
    .from(transactions)
    .innerJoin(transactionTags, eq(transactionTags.transactionId, transactions.id))
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactionTags.tagId, tag.id))
    .orderBy(transactions.date);

  const txIds = rows.map((r) => r.id);
  const tagsByTx = new Map<string, Tag[]>();
  if (txIds.length > 0) {
    const idChunks = chunks(txIds, 90);
    type TagJoinRow = { transactionId: string; id: string; name: string; color: string; createdAt: string };
    const tagRowsBatched = (await (db.batch as unknown as (s: unknown[]) => Promise<unknown>)(
      idChunks.map((chunk) =>
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
      )
    )) as TagJoinRow[][];
    for (const row of tagRowsBatched.flat()) {
      const { transactionId, ...t } = row;
      const list = tagsByTx.get(transactionId) ?? [];
      list.push(t);
      tagsByTx.set(transactionId, list);
    }
  }

  const txTransactions = rows.map(({ categoryName: _n, categoryGroupType: _g, ...t }) => ({
    ...t,
    tags: tagsByTx.get(t.id) ?? [tag]
  })) satisfies TagReportTransaction[];

  type CategoryBucket = {
    categoryId: number;
    categoryName: string;
    groupType: "INCOME" | "FIXED" | "VARIABLE";
    totalD: Decimal;
  };
  const byCatMap = new Map<number, CategoryBucket>();
  let totalIncomeD = new Decimal(0);
  let totalSpendD = new Decimal(0);
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    if (minDate === null || row.date < minDate) minDate = row.date;
    if (maxDate === null || row.date > maxDate) maxDate = row.date;

    const groupType = row.categoryGroupType as "INCOME" | "FIXED" | "VARIABLE" | "IGNORED" | null;
    if (groupType !== "INCOME" && groupType !== "FIXED" && groupType !== "VARIABLE") continue;
    if (row.categoryId === null || row.categoryName === null) continue;

    if (row.type === "CREDIT" && groupType === "INCOME") {
      totalIncomeD = add(totalIncomeD, row.amount);
    }
    if (row.type === "DEBIT") {
      totalSpendD = add(totalSpendD, row.amount);
    }

    const existing = byCatMap.get(row.categoryId);
    if (existing) {
      existing.totalD = add(existing.totalD, row.amount);
    } else {
      byCatMap.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        groupType,
        totalD: new Decimal(row.amount)
      });
    }
  }

  const byCategory: TagReportCategoryBreakdown[] = [...byCatMap.values()].map(({ totalD, ...rest }) => ({
    ...rest,
    total: toStorable(totalD)
  }));

  return {
    tag,
    totalIncome: toStorable(totalIncomeD),
    totalSpend: toStorable(totalSpendD),
    net: toStorable(subtract(totalIncomeD, totalSpendD)),
    byCategory,
    transactions: txTransactions,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null
  };
}

export type TagReportByNameResult = {
  report: TagReport;
  availableTags: string[];
};

export async function listTagNames(db: PnlDb): Promise<string[]> {
  const rows = await db.select({ name: tags.name }).from(tags).orderBy(asc(tags.name));
  return rows.map((r) => r.name);
}

export async function getTagReportByName(db: PnlDb, name: string): Promise<TagReportByNameResult | null> {
  const availableTags = await listTagNames(db);

  const [tag] = await db
    .select()
    .from(tags)
    .where(sql`LOWER(${tags.name}) LIKE LOWER('%' || ${name} || '%')`)
    .orderBy(sql`LENGTH(${tags.name}) ASC`)
    .limit(1);

  if (!tag) return null;

  const report = await buildTagReport(db, tag);
  return { report, availableTags };
}
