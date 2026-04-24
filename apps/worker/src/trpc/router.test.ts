import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@pnl/types";
import { categories, columnMappings, transactionInputSchema, transactions } from "@pnl/types";

import { appRouter } from "./router";

function makeDb() {
  return drizzle(env.DB, { schema });
}

function makeCaller() {
  return appRouter.createCaller({ db: makeDb() }, { onError: () => {} });
}

beforeEach(async () => {
  const db = makeDb();
  await db.delete(transactions);
  await db.delete(columnMappings);
  await db.delete(categories);
});

describe("transactions.getMapping", () => {
  it("returns null for unknown fingerprint", async () => {
    const result = await makeCaller().transactions.getMapping({ fingerprint: "unknown" });
    expect(result).toBeNull();
  });

  it("returns saved mapping when fingerprint matches", async () => {
    await makeDb().insert(columnMappings).values({
      fileFingerprint: "test-fp",
      dateCol: "Date",
      descriptionCol: "Description",
      amountCol: "Amount"
    });

    const result = await makeCaller().transactions.getMapping({ fingerprint: "test-fp" });
    expect(result).not.toBeNull();
    expect(result?.dateCol).toBe("Date");
    expect(result?.descriptionCol).toBe("Description");
    expect(result?.amountCol).toBe("Amount");
  });
});

describe("transactions.upload", () => {
  const aMapping = {
    fileFingerprint: "bank-fp",
    dateCol: "Date",
    descriptionCol: "Description",
    amountCol: "Amount"
  };

  const tx1 = {
    id: "hash-1",
    date: "2024-01-01",
    description: "Coffee",
    amount: 4.5,
    type: "DEBIT" as const,
    sourceFile: "bank.csv",
    rawRow: JSON.stringify({ Date: "2024-01-01", Description: "Coffee", Amount: "-4.50" }),
    createdAt: new Date().toISOString()
  };

  const tx2 = {
    id: "hash-2",
    date: "2024-01-02",
    description: "Salary",
    amount: 1000,
    type: "CREDIT" as const,
    sourceFile: "bank.csv",
    rawRow: JSON.stringify({ Date: "2024-01-02", Description: "Salary", Amount: "1000.00" }),
    createdAt: new Date().toISOString()
  };

  it("inserts new transactions and returns correct count", async () => {
    const result = await makeCaller().transactions.upload({
      transactions: [tx1, tx2],
      sourceFile: "bank.csv",
      mapping: aMapping
    });

    expect(result).toEqual({ inserted: 2, duplicates: 0, total: 2 });
  });

  it("skips duplicates on second upload and returns correct count", async () => {
    const caller = makeCaller();
    await caller.transactions.upload({
      transactions: [tx1, tx2],
      sourceFile: "bank.csv",
      mapping: aMapping
    });

    const result = await caller.transactions.upload({
      transactions: [tx1, tx2],
      sourceFile: "bank.csv",
      mapping: aMapping
    });

    expect(result).toEqual({ inserted: 0, duplicates: 2, total: 2 });
  });

  it("upserts column mapping when fingerprint already exists", async () => {
    const caller = makeCaller();
    await caller.transactions.upload({
      transactions: [],
      sourceFile: "bank.csv",
      mapping: { ...aMapping, amountCol: "Amount" }
    });

    await caller.transactions.upload({
      transactions: [],
      sourceFile: "bank.csv",
      mapping: { ...aMapping, amountCol: "Monto" }
    });

    const saved = await caller.transactions.getMapping({ fingerprint: "bank-fp" });
    expect(saved?.amountCol).toBe("Monto");
  });
});

describe("transactionInputSchema", () => {
  const validTx = {
    id: "hash-1",
    date: "2024-01-01",
    description: "Coffee",
    amount: 4.5,
    type: "DEBIT" as const,
    sourceFile: "bank.csv"
  };

  it("rejects date not matching YYYY-MM-DD", () => {
    const result = transactionInputSchema.safeParse({ ...validTx, date: "01-01-2024" });
    expect(result.success).toBe(false);
  });

  it("rejects negative amount", () => {
    const result = transactionInputSchema.safeParse({ ...validTx, amount: -4.5 });
    expect(result.success).toBe(false);
  });

  it("rejects zero amount", () => {
    const result = transactionInputSchema.safeParse({ ...validTx, amount: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts valid transaction", () => {
    const result = transactionInputSchema.safeParse(validTx);
    expect(result.success).toBe(true);
  });
});

describe("transactions.categorize", () => {
  const tx = {
    id: "tx-cat-1",
    date: "2024-01-15",
    description: "Coffee",
    amount: 4.5,
    type: "DEBIT" as const,
    sourceFile: "bank.csv",
    rawRow: "{}",
    createdAt: new Date().toISOString()
  };

  it("assigns a category to a transaction", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values(tx);

    await makeCaller().transactions.categorize({ ids: [tx.id], categoryId: cat!.id });

    const [updated] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(updated!.categoryId).toBe(cat!.id);
  });

  it("assigns category to multiple transactions and returns count", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const tx2 = { ...tx, id: "tx-cat-2", date: "2024-01-16" };
    await db.insert(transactions).values([tx, tx2]);

    const result = await makeCaller().transactions.categorize({ ids: [tx.id, tx2.id], categoryId: cat!.id });

    expect(result.updated).toBe(2);
    const rows = await db.select().from(transactions);
    expect(rows.every((r) => r.categoryId === cat!.id)).toBe(true);
  });

  it("removes category by setting categoryId to null", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values({ ...tx, categoryId: cat!.id });

    await makeCaller().transactions.categorize({ ids: [tx.id], categoryId: null });

    const [updated] = await db.select().from(transactions).where(eq(transactions.id, tx.id));
    expect(updated!.categoryId).toBeNull();
  });
});

describe("transactions.list", () => {
  const aMapping = { fileFingerprint: "fp", dateCol: "Date", descriptionCol: "Desc", amountCol: "Amount" };

  const tx1 = {
    id: "tx-1",
    date: "2024-01-15",
    description: "Coffee",
    amount: 4.5,
    type: "DEBIT" as const,
    sourceFile: "bank.csv",
    rawRow: "{}",
    createdAt: new Date().toISOString()
  };
  const tx2 = {
    id: "tx-2",
    date: "2024-02-10",
    description: "Salary",
    amount: 1000,
    type: "CREDIT" as const,
    sourceFile: "bank.csv",
    rawRow: "{}",
    createdAt: new Date().toISOString()
  };

  it("returns empty array when no transactions exist", async () => {
    const result = await makeCaller().transactions.list({});
    expect(result).toEqual([]);
  });

  it("returns all transactions ordered by date desc", async () => {
    await makeDb().insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({});

    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("tx-2");
    expect(result[1]!.id).toBe("tx-1");
  });

  it("filters transactions by month", async () => {
    await makeDb().insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({ month: "2024-01" });

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("tx-1");
  });

  it("joins category name and groupType when categoryId is set", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Groceries", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values({ ...tx1, categoryId: cat!.id });

    const result = await makeCaller().transactions.list({});

    expect(result[0]!.categoryName).toBe("Groceries");
    expect(result[0]!.categoryGroupType).toBe("VARIABLE");
  });

  it("returns null category fields for uncategorized transactions", async () => {
    await makeDb().insert(transactions).values(tx1);

    const result = await makeCaller().transactions.list({});

    expect(result[0]!.categoryName).toBeNull();
    expect(result[0]!.categoryId).toBeNull();
  });
});
