import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@pnl/types";
import {
  categories,
  columnMappings,
  getSpendingByCategory,
  getTopMerchants,
  listTransactions,
  searchTransactions,
  transactions
} from "@pnl/types";

function makeDb() {
  return drizzle(env.DB, { schema });
}

beforeEach(async () => {
  const db = makeDb();
  await db.delete(transactions);
  await db.delete(columnMappings);
  await db.delete(categories);
});

const baseTx = (overrides: Partial<typeof transactions.$inferInsert>) => ({
  id: "tx-1",
  date: "2024-01-15",
  description: "Coffee",
  amount: 4.5,
  type: "DEBIT" as const,
  sourceFile: "bank.csv",
  rawRow: "{}",
  createdAt: new Date().toISOString(),
  ...overrides
});

describe("listTransactions", () => {
  it("returns empty rows and zero total when no transactions exist", async () => {
    const result = await listTransactions(makeDb(), {});
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it("filters by month using YYYY-MM prefix", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([baseTx({ id: "tx-jan", date: "2024-01-15" }), baseTx({ id: "tx-feb", date: "2024-02-10" })]);

    const result = await listTransactions(db, { month: "2024-01" });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe("tx-jan");
    expect(result.total).toBe(1);
  });

  it("filters by categoryId", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [pay] = await db.insert(categories).values({ name: "Pay", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "tx-food", categoryId: food!.id }),
        baseTx({ id: "tx-pay", date: "2024-01-16", categoryId: pay!.id, type: "CREDIT" })
      ]);

    const result = await listTransactions(db, { categoryId: food!.id });

    expect(result.rows.map((r) => r.id)).toEqual(["tx-food"]);
  });

  it("filters to only uncategorized transactions when uncategorized=true", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "tx-categorized", categoryId: food!.id }),
        baseTx({ id: "tx-uncategorized", date: "2024-02-10" })
      ]);

    const result = await listTransactions(db, { uncategorized: true });

    expect(result.rows.map((r) => r.id)).toEqual(["tx-uncategorized"]);
  });

  it("populates categoryName via JOIN and returns null for uncategorized", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "tx-categorized", date: "2024-03-01", categoryId: food!.id }),
        baseTx({ id: "tx-uncategorized", date: "2024-02-10" })
      ]);

    const result = await listTransactions(db, {});

    const categorized = result.rows.find((r) => r.id === "tx-categorized")!;
    const uncategorized = result.rows.find((r) => r.id === "tx-uncategorized")!;
    expect(categorized.categoryName).toBe("Food");
    expect(categorized.categoryId).toBe(food!.id);
    expect(uncategorized.categoryName).toBeNull();
    expect(uncategorized.categoryId).toBeNull();
  });

  it("paginates via limit and offset and total reflects unfiltered (by page) count", async () => {
    const db = makeDb();
    const rows = Array.from({ length: 5 }).map((_, i) => baseTx({ id: `tx-${i}`, date: `2024-04-0${i + 1}` }));
    await db.insert(transactions).values(rows);

    const page1 = await listTransactions(db, { limit: 2, offset: 0 });
    const page2 = await listTransactions(db, { limit: 2, offset: 2 });

    expect(page1.rows.map((r) => r.id)).toEqual(["tx-4", "tx-3"]);
    expect(page1.total).toBe(5);
    expect(page2.rows.map((r) => r.id)).toEqual(["tx-2", "tx-1"]);
    expect(page2.total).toBe(5);
  });

  it("returns all rows ordered by date desc with the slim row shape", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([baseTx({ id: "tx-old", date: "2024-01-10" }), baseTx({ id: "tx-new", date: "2024-03-01" })]);

    const result = await listTransactions(db, {});

    expect(result.total).toBe(2);
    expect(result.rows.map((r) => r.id)).toEqual(["tx-new", "tx-old"]);
    expect(Object.keys(result.rows[0]!).sort()).toEqual(
      ["amount", "categoryId", "categoryName", "date", "description", "id", "type"].sort()
    );
  });
});

describe("getSpendingByCategory", () => {
  it("sums DEBIT amounts per FIXED/VARIABLE category for the month, sorted desc", async () => {
    const db = makeDb();
    const [groceries] = await db.insert(categories).values({ name: "Groceries", groupType: "VARIABLE" }).returning();
    const [rent] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "g1", date: "2024-01-05", amount: 30, categoryId: groceries!.id }),
        baseTx({ id: "g2", date: "2024-01-15", amount: 70, categoryId: groceries!.id }),
        baseTx({ id: "r1", date: "2024-01-01", amount: 1200, categoryId: rent!.id })
      ]);

    const result = await getSpendingByCategory(db, "2024-01");

    expect(result).toEqual([
      { categoryId: rent!.id, categoryName: "Rent", groupType: "FIXED", total: 1200 },
      { categoryId: groceries!.id, categoryName: "Groceries", groupType: "VARIABLE", total: 100 }
    ]);
  });

  it("excludes INCOME and IGNORED categories", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [transfer] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "s1", amount: 5000, type: "CREDIT", categoryId: salary!.id }),
        baseTx({ id: "t1", date: "2024-01-02", amount: 200, categoryId: transfer!.id }),
        baseTx({ id: "f1", date: "2024-01-03", amount: 25, categoryId: food!.id })
      ]);

    const result = await getSpendingByCategory(db, "2024-01");

    expect(result.map((r) => r.categoryName)).toEqual(["Food"]);
  });

  it("ignores CREDIT amounts even on FIXED/VARIABLE categories (e.g. refunds)", async () => {
    const db = makeDb();
    const [shopping] = await db.insert(categories).values({ name: "Shopping", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "buy", amount: 100, type: "DEBIT", categoryId: shopping!.id }),
        baseTx({ id: "refund", date: "2024-01-20", amount: 30, type: "CREDIT", categoryId: shopping!.id })
      ]);

    const result = await getSpendingByCategory(db, "2024-01");

    expect(result).toEqual([{ categoryId: shopping!.id, categoryName: "Shopping", groupType: "VARIABLE", total: 100 }]);
  });

  it("filters by month — does not bleed across months", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "jan", date: "2024-01-15", amount: 50, categoryId: food!.id }),
        baseTx({ id: "feb", date: "2024-02-15", amount: 999, categoryId: food!.id })
      ]);

    const result = await getSpendingByCategory(db, "2024-01");

    expect(result).toEqual([{ categoryId: food!.id, categoryName: "Food", groupType: "VARIABLE", total: 50 }]);
  });

  it("returns empty array when no spending in the month", async () => {
    const result = await getSpendingByCategory(makeDb(), "2024-01");
    expect(result).toEqual([]);
  });
});

describe("getTopMerchants", () => {
  it("groups transactions by description and returns count + total sorted desc", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "c1", description: "Starbucks", amount: 5 }),
        baseTx({ id: "c2", date: "2024-01-16", description: "Starbucks", amount: 7 }),
        baseTx({ id: "u1", date: "2024-01-17", description: "Uber", amount: 50 })
      ]);

    const result = await getTopMerchants(db, {});

    expect(result).toEqual([
      { merchant: "UBER", count: 1, total: 50 },
      { merchant: "STARBUCKS", count: 2, total: 12 }
    ]);
  });

  it("groups case-insensitively and trims whitespace", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "c1", description: "Coffee", amount: 4 }),
        baseTx({ id: "c2", date: "2024-01-16", description: "COFFEE", amount: 5 }),
        baseTx({ id: "c3", date: "2024-01-17", description: "  coffee  ", amount: 6 })
      ]);

    const result = await getTopMerchants(db, {});

    expect(result).toEqual([{ merchant: "COFFEE", count: 3, total: 15 }]);
  });

  it("filters by month when provided", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "jan", date: "2024-01-15", description: "Lyft", amount: 20 }),
        baseTx({ id: "feb", date: "2024-02-15", description: "Lyft", amount: 999 })
      ]);

    const result = await getTopMerchants(db, { month: "2024-01" });

    expect(result).toEqual([{ merchant: "LYFT", count: 1, total: 20 }]);
  });

  it("respects the limit parameter", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "a", description: "A", amount: 100 }),
        baseTx({ id: "b", date: "2024-01-16", description: "B", amount: 90 }),
        baseTx({ id: "c", date: "2024-01-17", description: "C", amount: 80 })
      ]);

    const result = await getTopMerchants(db, { limit: 2 });

    expect(result.map((r) => r.merchant)).toEqual(["A", "B"]);
  });
});

describe("searchTransactions", () => {
  it("returns rows whose description contains the query, case-insensitively", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "wf1", date: "2024-01-15", description: "Whole Foods Market" }),
        baseTx({ id: "wf2", date: "2024-02-10", description: "WHOLE FOODS" }),
        baseTx({ id: "tj", date: "2024-02-12", description: "Trader Joe's" })
      ]);

    const result = await searchTransactions(db, { query: "whole foods" });

    expect(result.map((r) => r.id).sort()).toEqual(["wf1", "wf2"]);
  });

  it("matches a substring anywhere in the description", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "a", description: "AMZN Mktp Charge" }),
        baseTx({ id: "b", date: "2024-01-16", description: "Pharmacy" })
      ]);

    const result = await searchTransactions(db, { query: "mktp" });

    expect(result.map((r) => r.id)).toEqual(["a"]);
  });

  it("combines query with month filter", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "jan", date: "2024-01-15", description: "Coffee" }),
        baseTx({ id: "feb", date: "2024-02-15", description: "Coffee" })
      ]);

    const result = await searchTransactions(db, { query: "coffee", month: "2024-01" });

    expect(result.map((r) => r.id)).toEqual(["jan"]);
  });

  it("respects the limit parameter and orders by date desc", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "old", date: "2024-01-01", description: "Coffee" }),
        baseTx({ id: "mid", date: "2024-02-01", description: "Coffee" }),
        baseTx({ id: "new", date: "2024-03-01", description: "Coffee" })
      ]);

    const result = await searchTransactions(db, { query: "coffee", limit: 2 });

    expect(result.map((r) => r.id)).toEqual(["new", "mid"]);
  });
});
