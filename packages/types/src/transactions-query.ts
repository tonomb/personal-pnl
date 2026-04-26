import { and, count, desc, eq, inArray, isNull, like, sql, type SQL } from "drizzle-orm";

import { categories, transactions } from "./schema";

import type { PnlDb } from "./pnl";

export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  categoryId: number | null;
  categoryName: string | null;
};

export type ListTransactionsInput = {
  month?: string;
  categoryId?: number;
  uncategorized?: boolean;
  limit?: number;
  offset?: number;
};

export type ListTransactionsResult = {
  rows: TransactionRow[];
  total: number;
};

export type SpendingByCategoryRow = {
  categoryId: number;
  categoryName: string;
  groupType: "FIXED" | "VARIABLE";
  total: number;
};

export type TopMerchantsInput = {
  month?: string;
  limit?: number;
};

export type TopMerchantRow = {
  merchant: string;
  count: number;
  total: number;
};

export type SearchTransactionsInput = {
  query: string;
  month?: string;
  limit?: number;
};

export async function searchTransactions(db: PnlDb, input: SearchTransactionsInput): Promise<TransactionRow[]> {
  const limit = Math.min(input.limit ?? 50, 200);
  const filters: SQL[] = [sql`UPPER(${transactions.description}) LIKE UPPER('%' || ${input.query} || '%')`];
  if (input.month) filters.push(like(transactions.date, `${input.month}%`));

  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(...filters))
    .orderBy(desc(transactions.date))
    .limit(limit);
}

export async function getTopMerchants(db: PnlDb, input: TopMerchantsInput): Promise<TopMerchantRow[]> {
  const limit = Math.min(input.limit ?? 10, 200);
  const merchant = sql<string>`UPPER(TRIM(${transactions.description}))`;
  const totalSum = sql<number>`SUM(${transactions.amount})`;

  const rows = await db
    .select({
      merchant,
      count: count(),
      total: totalSum
    })
    .from(transactions)
    .where(input.month ? like(transactions.date, `${input.month}%`) : undefined)
    .groupBy(merchant)
    .orderBy(desc(totalSum))
    .limit(limit);

  return rows.map((r) => ({
    merchant: r.merchant,
    count: r.count,
    total: Number(r.total ?? 0)
  }));
}

export async function getSpendingByCategory(db: PnlDb, month: string): Promise<SpendingByCategoryRow[]> {
  const debitSum = sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`;

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      total: debitSum
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(like(transactions.date, `${month}%`), inArray(categories.groupType, ["FIXED", "VARIABLE"])))
    .groupBy(transactions.categoryId, categories.name, categories.groupType)
    .orderBy(desc(debitSum));

  return rows.map((r) => ({
    categoryId: r.categoryId as number,
    categoryName: r.categoryName,
    groupType: r.groupType as "FIXED" | "VARIABLE",
    total: Number(r.total ?? 0)
  }));
}

export async function listTransactions(db: PnlDb, input: ListTransactionsInput): Promise<ListTransactionsResult> {
  const filters: SQL[] = [];
  if (input.month) filters.push(like(transactions.date, `${input.month}%`));
  if (input.categoryId !== undefined) filters.push(eq(transactions.categoryId, input.categoryId));
  if (input.uncategorized) filters.push(isNull(transactions.categoryId));
  const whereClause = filters.length ? and(...filters) : undefined;

  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;

  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      description: transactions.description,
      amount: transactions.amount,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(whereClause)
    .orderBy(desc(transactions.date))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db.select({ total: count() }).from(transactions).where(whereClause);

  return { rows, total: totalRow?.total ?? 0 };
}
