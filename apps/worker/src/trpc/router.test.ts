import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@pnl/types";
import {
  categories,
  columnMappings,
  createTagInputSchema,
  tags,
  transactionInputSchema,
  transactions,
  transactionTags
} from "@pnl/types";

import { appRouter } from "./router";

function makeDb() {
  return drizzle(env.DB, { schema });
}

function makeCaller() {
  return appRouter.createCaller({ db: makeDb() }, { onError: () => {} });
}

beforeEach(async () => {
  const db = makeDb();
  await db.delete(transactionTags);
  await db.delete(tags);
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

  it("returns empty rows and zero total when no transactions exist", async () => {
    const result = await makeCaller().transactions.list({});
    expect(result).toEqual({ rows: [], total: 0 });
  });

  it("returns all transactions ordered by date desc", async () => {
    await makeDb().insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({});

    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.rows[0]!.id).toBe("tx-2");
    expect(result.rows[1]!.id).toBe("tx-1");
  });

  it("filters transactions by month", async () => {
    await makeDb().insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({ month: "2024-01" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.id).toBe("tx-1");
  });

  it("joins category name and groupType when categoryId is set", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Groceries", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values({ ...tx1, categoryId: cat!.id });

    const result = await makeCaller().transactions.list({});

    expect(result.rows[0]!.categoryName).toBe("Groceries");
    expect(result.rows[0]!.categoryGroupType).toBe("VARIABLE");
  });

  it("returns null category fields for uncategorized transactions", async () => {
    await makeDb().insert(transactions).values(tx1);

    const result = await makeCaller().transactions.list({});

    expect(result.rows[0]!.categoryName).toBeNull();
    expect(result.rows[0]!.categoryId).toBeNull();
  });

  it("filters to only uncategorized transactions when uncategorized=true", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values([{ ...tx1, categoryId: food!.id }, tx2]);

    const result = await makeCaller().transactions.list({ uncategorized: true });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe("tx-2");
  });

  it("filters transactions by categoryId", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [pay] = await db.insert(categories).values({ name: "Pay", groupType: "INCOME" }).returning();
    await db.insert(transactions).values([
      { ...tx1, categoryId: food!.id },
      { ...tx2, categoryId: pay!.id }
    ]);

    const result = await makeCaller().transactions.list({ categoryId: food!.id });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.id).toBe("tx-1");
  });

  it("paginates with limit and offset, and returns unfiltered-by-page total", async () => {
    const db = makeDb();
    const rows = Array.from({ length: 5 }).map((_, i) => ({
      id: `tx-p-${i}`,
      date: `2024-03-0${i + 1}`,
      description: `d${i}`,
      amount: 1 + i,
      type: "DEBIT" as const,
      sourceFile: "bank.csv",
      rawRow: "{}",
      createdAt: new Date().toISOString()
    }));
    await db.insert(transactions).values(rows);

    const page1 = await makeCaller().transactions.list({ limit: 2, offset: 0 });
    const page2 = await makeCaller().transactions.list({ limit: 2, offset: 2 });

    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.rows[0]!.id).toBe("tx-p-4");
    expect(page2.rows).toHaveLength(2);
    expect(page2.rows[0]!.id).toBe("tx-p-2");
  });

  it("total reflects filters, not pagination", async () => {
    const db = makeDb();
    await db.insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({ month: "2024-01", limit: 100 });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("filters to only transactions tagged with tagId", async () => {
    const db = makeDb();
    const caller = makeCaller();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    await db.insert(transactions).values([tx1, tx2]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: [tx1.id] });

    const result = await caller.transactions.list({ tagId: tag.id });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.id).toBe(tx1.id);
    expect(result.rows[0]!.tags).toHaveLength(1);
    expect(result.rows[0]!.tags[0]!.id).toBe(tag.id);
  });

  it("AND-composes tagId filter with month filter", async () => {
    const db = makeDb();
    const caller = makeCaller();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    await db.insert(transactions).values([tx1, tx2]);
    // Tag both, but only tx1 is in 2024-01
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: [tx1.id, tx2.id] });

    const result = await caller.transactions.list({ tagId: tag.id, month: "2024-01" });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.rows[0]!.id).toBe(tx1.id);
  });

  it("returns empty for unknown tagId", async () => {
    await makeDb().insert(transactions).values([tx1, tx2]);

    const result = await makeCaller().transactions.list({ tagId: "missing-tag" });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

describe("categories.create", () => {
  it("creates a category with name and groupType", async () => {
    const created = await makeCaller().categories.create({ name: "Food", groupType: "VARIABLE" });
    expect(created.name).toBe("Food");
    expect(created.groupType).toBe("VARIABLE");
  });

  it("creates a category with an optional color", async () => {
    const created = await makeCaller().categories.create({ name: "Food", groupType: "VARIABLE", color: "#ff00ff" });
    expect(created.color).toBe("#ff00ff");
  });
});

describe("categories.update", () => {
  it("renames a category", async () => {
    const [cat] = await makeDb().insert(categories).values({ name: "Old", groupType: "VARIABLE" }).returning();

    const updated = await makeCaller().categories.update({ id: cat!.id, name: "New" });

    expect(updated.name).toBe("New");
    expect(updated.id).toBe(cat!.id);
  });

  it("updates color, groupType, and sortOrder", async () => {
    const [cat] = await makeDb().insert(categories).values({ name: "X", groupType: "VARIABLE" }).returning();

    const updated = await makeCaller().categories.update({
      id: cat!.id,
      color: "#123456",
      groupType: "FIXED",
      sortOrder: 7
    });

    expect(updated.color).toBe("#123456");
    expect(updated.groupType).toBe("FIXED");
    expect(updated.sortOrder).toBe(7);
  });

  it("leaves unspecified fields unchanged", async () => {
    const [cat] = await makeDb()
      .insert(categories)
      .values({ name: "X", groupType: "VARIABLE", color: "#abc" })
      .returning();

    const updated = await makeCaller().categories.update({ id: cat!.id, name: "Y" });

    expect(updated.color).toBe("#abc");
    expect(updated.groupType).toBe("VARIABLE");
  });

  it("throws when the category does not exist", async () => {
    await expect(makeCaller().categories.update({ id: 99999, name: "Ghost" })).rejects.toThrow();
  });
});

describe("categories.delete", () => {
  it("removes a category", async () => {
    const [cat] = await makeDb().insert(categories).values({ name: "Gone", groupType: "VARIABLE" }).returning();

    await makeCaller().categories.delete({ id: cat!.id });

    const rows = await makeDb().select().from(categories).where(eq(categories.id, cat!.id));
    expect(rows).toHaveLength(0);
  });

  it("leaves transactions orphaned with null categoryId when their category is deleted", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Temp", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values({
      id: "tx-d-1",
      date: "2024-01-01",
      description: "x",
      amount: 1,
      type: "DEBIT",
      sourceFile: "bank.csv",
      rawRow: "{}",
      createdAt: new Date().toISOString(),
      categoryId: cat!.id
    });

    await makeCaller().categories.delete({ id: cat!.id });

    const [tx] = await db.select().from(transactions).where(eq(transactions.id, "tx-d-1"));
    expect(tx).toBeDefined();
    expect(tx!.categoryId).toBeNull();
  });

  it("throws when the category does not exist", async () => {
    await expect(makeCaller().categories.delete({ id: 99999 })).rejects.toThrow();
  });
});

describe("transactions.grouped", () => {
  const baseTx = (
    overrides: Partial<{ id: string; description: string; amount: number; date: string; categoryId: number | null }>
  ) => ({
    id: "tx-g-1",
    date: "2024-01-01",
    description: "Uber",
    amount: 10,
    type: "DEBIT" as const,
    sourceFile: "bank.csv",
    rawRow: "{}",
    createdAt: new Date().toISOString(),
    categoryId: null as number | null,
    ...overrides
  });

  it("returns empty array when no transactions exist", async () => {
    const result = await makeCaller().transactions.grouped({});
    expect(result).toEqual([]);
  });

  it("groups by description with count and total amount", async () => {
    await makeDb()
      .insert(transactions)
      .values([
        baseTx({ id: "g-1", description: "Uber", amount: 10 }),
        baseTx({ id: "g-2", description: "Uber", amount: 15 }),
        baseTx({ id: "g-3", description: "Coffee", amount: 4 })
      ]);

    const result = await makeCaller().transactions.grouped({});

    const uber = result.find((g) => g.description === "Uber");
    const coffee = result.find((g) => g.description === "Coffee");
    expect(uber).toEqual(expect.objectContaining({ count: 2, totalAmount: 25 }));
    expect(coffee).toEqual(expect.objectContaining({ count: 1, totalAmount: 4 }));
  });

  it("returns the most-common category for a merchant", async () => {
    const db = makeDb();
    const [food] = await db
      .insert(categories)
      .values({ name: "Food", groupType: "VARIABLE", color: "#f00" })
      .returning();
    const [transport] = await db
      .insert(categories)
      .values({ name: "Transport", groupType: "VARIABLE", color: "#0f0" })
      .returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "mc-1", description: "Uber", categoryId: transport!.id }),
        baseTx({ id: "mc-2", description: "Uber", categoryId: transport!.id }),
        baseTx({ id: "mc-3", description: "Uber", categoryId: food!.id })
      ]);

    const result = await makeCaller().transactions.grouped({});
    const uber = result.find((g) => g.description === "Uber")!;

    expect(uber.categoryId).toBe(transport!.id);
    expect(uber.categoryName).toBe("Transport");
    expect(uber.categoryGroupType).toBe("VARIABLE");
    expect(uber.categoryColor).toBe("#0f0");
  });

  it("returns null category when merchant has no categorized transactions", async () => {
    await makeDb()
      .insert(transactions)
      .values([baseTx({ id: "n-1", description: "Mystery", categoryId: null })]);

    const result = await makeCaller().transactions.grouped({});
    const mystery = result.find((g) => g.description === "Mystery")!;

    expect(mystery.categoryId).toBeNull();
    expect(mystery.categoryName).toBeNull();
  });

  it("returns null category when categories are tied", async () => {
    const db = makeDb();
    const [a] = await db.insert(categories).values({ name: "A", groupType: "VARIABLE" }).returning();
    const [b] = await db.insert(categories).values({ name: "B", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "t-1", description: "Ambig", categoryId: a!.id }),
        baseTx({ id: "t-2", description: "Ambig", categoryId: b!.id })
      ]);

    const result = await makeCaller().transactions.grouped({});
    const ambig = result.find((g) => g.description === "Ambig")!;

    expect(ambig.categoryId).toBeNull();
  });

  it("filters grouped results by month", async () => {
    await makeDb()
      .insert(transactions)
      .values([
        baseTx({ id: "f-1", description: "Uber", date: "2024-01-05", amount: 10 }),
        baseTx({ id: "f-2", description: "Uber", date: "2024-02-05", amount: 20 })
      ]);

    const result = await makeCaller().transactions.grouped({ month: "2024-01" });
    const uber = result.find((g) => g.description === "Uber")!;

    expect(uber.count).toBe(1);
    expect(uber.totalAmount).toBe(10);
  });

  it("filters grouped results to uncategorized only", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "fu-1", description: "Coffee", categoryId: food!.id }),
        baseTx({ id: "fu-2", description: "Mystery", categoryId: null })
      ]);

    const result = await makeCaller().transactions.grouped({ uncategorized: true });

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe("Mystery");
  });

  it("filters grouped results by categoryId", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [pay] = await db.insert(categories).values({ name: "Pay", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "fc-1", description: "Coffee", categoryId: food!.id }),
        baseTx({ id: "fc-2", description: "Salary", categoryId: pay!.id })
      ]);

    const result = await makeCaller().transactions.grouped({ categoryId: food!.id });

    expect(result).toHaveLength(1);
    expect(result[0]!.description).toBe("Coffee");
  });

  it("ignores uncategorized transactions when computing most-common", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "u-1", description: "Shop", categoryId: food!.id }),
        baseTx({ id: "u-2", description: "Shop", categoryId: null }),
        baseTx({ id: "u-3", description: "Shop", categoryId: null })
      ]);

    const result = await makeCaller().transactions.grouped({});
    const shop = result.find((g) => g.description === "Shop")!;

    expect(shop.categoryId).toBe(food!.id);
  });
});

// ---------------------------------------------------------------------------
// pnl helpers shared across pnl test suites
// ---------------------------------------------------------------------------

function makePnlTx(overrides: {
  id: string;
  date: string;
  amount: number;
  type: "CREDIT" | "DEBIT";
  categoryId?: number | null;
}) {
  return {
    description: "tx",
    sourceFile: "bank.csv",
    rawRow: "{}",
    createdAt: new Date().toISOString(),
    categoryId: null as number | null,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// pnl.getReport
// ---------------------------------------------------------------------------

describe("pnl.getReport", () => {
  it("returns empty months and zero YTD when no transactions exist", async () => {
    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months).toEqual([]);
    expect(result.ytdIncome).toBe(0);
    expect(result.ytdExpenses).toBe(0);
    expect(result.ytdNet).toBe(0);
    expect(result.avgMonthlySavingsRate).toBeNull();
    expect(result.uncategorizedCount).toBe(0);
  });

  it("counts CREDIT in INCOME category as income with named items", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values(makePnlTx({ id: "r-1", date: "2024-01-15", amount: 1000, type: "CREDIT", categoryId: cat!.id }));

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months).toHaveLength(1);
    expect(result.months[0]!.month).toBe("2024-01");
    expect(result.months[0]!.income.total).toBe(1000);
    expect(result.months[0]!.income.items).toHaveLength(1);
    expect(result.months[0]!.income.items[0]!.categoryName).toBe("Salary");
    expect(result.months[0]!.income.items[0]!.total).toBe(1000);
    expect(result.ytdIncome).toBe(1000);
  });

  it("counts DEBIT in FIXED category as fixed expenses", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values(makePnlTx({ id: "r-2", date: "2024-01-05", amount: 500, type: "DEBIT", categoryId: cat!.id }));

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months[0]!.fixed.total).toBe(500);
    expect(result.months[0]!.fixed.items[0]!.categoryName).toBe("Rent");
    expect(result.ytdExpenses).toBe(500);
  });

  it("counts DEBIT in VARIABLE category as variable expenses", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Groceries", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values(makePnlTx({ id: "r-3", date: "2024-01-10", amount: 200, type: "DEBIT", categoryId: cat!.id }));

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months[0]!.variable.total).toBe(200);
    expect(result.months[0]!.variable.items[0]!.categoryName).toBe("Groceries");
    expect(result.ytdExpenses).toBe(200);
  });

  it("excludes IGNORED transactions from net/income/fixed/variable but tracks in ignored group", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [ign] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "r-4a", date: "2024-01-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "r-4b", date: "2024-01-01", amount: 500, type: "DEBIT", categoryId: ign!.id })
      ]);

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    const jan = result.months[0]!;
    expect(jan.income.total).toBe(1000);
    expect(jan.fixed.total).toBe(0);
    expect(jan.variable.total).toBe(0);
    expect(jan.net).toBe(1000);
    expect(jan.ignored.total).toBe(500);
    expect(jan.ignored.items[0]!.categoryName).toBe("Transfer");
    expect(result.ytdExpenses).toBe(0);
  });

  it("excludes uncategorized transactions from totals but counts them as uncategorizedCount", async () => {
    const db = makeDb();
    const [cat] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "r-5a", date: "2024-01-01", amount: 1000, type: "CREDIT", categoryId: cat!.id }),
        makePnlTx({ id: "r-5b", date: "2024-01-05", amount: 50, type: "DEBIT", categoryId: null }),
        makePnlTx({ id: "r-5c", date: "2024-01-15", amount: 30, type: "DEBIT", categoryId: null })
      ]);

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months[0]!.income.total).toBe(1000);
    expect(result.months[0]!.variable.total).toBe(0);
    expect(result.uncategorizedCount).toBe(2);
  });

  it("computes net = income - fixed - variable and savingsRate = net / income", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    const [vrb] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "r-6a", date: "2024-01-01", amount: 3000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "r-6b", date: "2024-01-01", amount: 1000, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "r-6c", date: "2024-01-01", amount: 500, type: "DEBIT", categoryId: vrb!.id })
      ]);

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    const jan = result.months[0]!;
    expect(jan.income.total).toBe(3000);
    expect(jan.fixed.total).toBe(1000);
    expect(jan.variable.total).toBe(500);
    expect(jan.net).toBe(1500);
    // savingsRate = 1500 / 3000 = 0.5
    expect(jan.savingsRate).toBeCloseTo(0.5, 5);
  });

  it("sets savingsRate to null when income is zero", async () => {
    const db = makeDb();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values(makePnlTx({ id: "r-7", date: "2024-01-01", amount: 500, type: "DEBIT", categoryId: fix!.id }));

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months[0]!.savingsRate).toBeNull();
  });

  it("aggregates YTD across multiple months and computes avgMonthlySavingsRate", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "r-8a", date: "2024-01-01", amount: 2000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "r-8b", date: "2024-01-01", amount: 800, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "r-8c", date: "2024-02-01", amount: 2000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "r-8d", date: "2024-02-01", amount: 800, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getReport({ year: 2024 });
    expect(result.months).toHaveLength(2);
    expect(result.ytdIncome).toBe(4000);
    expect(result.ytdExpenses).toBe(1600);
    expect(result.ytdNet).toBe(2400);
    // each month: net=1200, income=2000 → savingsRate=0.6
    expect(result.avgMonthlySavingsRate).toBeCloseTo(0.6, 5);
  });
});

// ---------------------------------------------------------------------------
// pnl.getMonth
// ---------------------------------------------------------------------------

describe("pnl.getMonth", () => {
  it("returns MonthlyPnL for the requested month and excludes other months", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "m-1a", date: "2024-03-10", amount: 3000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "m-1b", date: "2024-03-10", amount: 1000, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "m-1c", date: "2024-04-01", amount: 999, type: "CREDIT", categoryId: inc!.id })
      ]);

    const result = await makeCaller().pnl.getMonth({ month: "2024-03" });
    expect(result.month).toBe("2024-03");
    expect(result.income.total).toBe(3000);
    expect(result.fixed.total).toBe(1000);
    expect(result.net).toBe(2000);
    expect(result.savingsRate).toBe(0.67); // Math.round(2000/3000 * 100) / 100
  });

  it("returns zero totals and null savingsRate for a month with no transactions", async () => {
    const result = await makeCaller().pnl.getMonth({ month: "2024-05" });
    expect(result.month).toBe("2024-05");
    expect(result.income.total).toBe(0);
    expect(result.fixed.total).toBe(0);
    expect(result.variable.total).toBe(0);
    expect(result.net).toBe(0);
    expect(result.savingsRate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// pnl.getKpis
// ---------------------------------------------------------------------------

describe("pnl.getKpis", () => {
  it("returns IN_THE_GREEN when net income is positive", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-1a", date: "2024-03-01", amount: 3000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-1b", date: "2024-03-01", amount: 1000, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.net).toBe(2000);
    expect(result.netLabel).toBe("IN_THE_GREEN");
  });

  it("returns IN_THE_RED when net income is negative", async () => {
    const db = makeDb();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([makePnlTx({ id: "k-2a", date: "2024-03-01", amount: 500, type: "DEBIT", categoryId: fix!.id })]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.net).toBe(-500);
    expect(result.netLabel).toBe("IN_THE_RED");
  });

  it("returns NEUTRAL when net is exactly zero", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-3a", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-3b", date: "2024-03-01", amount: 1000, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.net).toBe(0);
    expect(result.netLabel).toBe("NEUTRAL");
  });

  it("returns HEALTHY savingsLabel when savings rate is >= 20%", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    // net = 800, income = 1000, savingsRate = 0.8
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-4a", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-4b", date: "2024-03-01", amount: 200, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.savingsLabel).toBe("HEALTHY");
  });

  it("returns WATCH savingsLabel when savings rate is 10–19%", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    // net = 150, income = 1000, savingsRate = 0.15
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-5a", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-5b", date: "2024-03-01", amount: 850, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.savingsLabel).toBe("WATCH");
  });

  it("returns DANGER savingsLabel when savings rate is below 10%", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    // net = 50, income = 1000, savingsRate = 0.05
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-6a", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-6b", date: "2024-03-01", amount: 950, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.savingsLabel).toBe("DANGER");
  });

  it("returns null savingsLabel when there is no income", async () => {
    const db = makeDb();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([makePnlTx({ id: "k-7a", date: "2024-03-01", amount: 500, type: "DEBIT", categoryId: fix!.id })]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.savingsRate).toBeNull();
    expect(result.savingsLabel).toBeNull();
  });

  it("returns the biggest expense category by total across fixed and variable", async () => {
    const db = makeDb();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    const [vrb] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-8a", date: "2024-03-01", amount: 1200, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "k-8b", date: "2024-03-01", amount: 300, type: "DEBIT", categoryId: vrb!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.biggestExpense).toEqual({ name: "Rent", total: 1200 });
  });

  it("returns null biggestExpense when there are no expense transactions", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([makePnlTx({ id: "k-9a", date: "2024-03-01", amount: 2000, type: "CREDIT", categoryId: inc!.id })]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.biggestExpense).toBeNull();
  });

  it("returns BETTER when current net exceeds prior month net", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    // Feb: net = 500 (1000 - 500); Mar: net = 800 (1000 - 200) → delta = +300
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-10a", date: "2024-02-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-10b", date: "2024-02-01", amount: 500, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "k-10c", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-10d", date: "2024-03-01", amount: 200, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.vsLastMonth?.delta).toBe(300);
    expect(result.vsLastMonth?.label).toBe("BETTER");
  });

  it("returns WORSE when current net is less than prior month net", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    // Feb: net = 800; Mar: net = 300 → delta = -500
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-11a", date: "2024-02-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-11b", date: "2024-02-01", amount: 200, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "k-11c", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-11d", date: "2024-03-01", amount: 700, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.vsLastMonth?.delta).toBe(-500);
    expect(result.vsLastMonth?.label).toBe("WORSE");
  });

  it("returns SAME when current net equals prior month net", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [fix] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    await db
      .insert(transactions)
      .values([
        makePnlTx({ id: "k-12a", date: "2024-02-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-12b", date: "2024-02-01", amount: 600, type: "DEBIT", categoryId: fix!.id }),
        makePnlTx({ id: "k-12c", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: inc!.id }),
        makePnlTx({ id: "k-12d", date: "2024-03-01", amount: 600, type: "DEBIT", categoryId: fix!.id })
      ]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.vsLastMonth?.delta).toBe(0);
    expect(result.vsLastMonth?.label).toBe("SAME");
  });

  it("returns null vsLastMonth when there is no data for the prior month", async () => {
    const db = makeDb();
    const [inc] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([makePnlTx({ id: "k-13a", date: "2024-03-01", amount: 2000, type: "CREDIT", categoryId: inc!.id })]);

    const result = await makeCaller().pnl.getKpis({ month: "2024-03" });

    expect(result.vsLastMonth).toBeNull();
  });
});

describe("tags.list", () => {
  it("returns empty array when no tags exist", async () => {
    const result = await makeCaller().tags.list();
    expect(result).toEqual([]);
  });

  it("returns tag with transactionCount: 0 when unassigned", async () => {
    await makeCaller().tags.create({ name: "Travel", color: "#3B82F6" });

    const result = await makeCaller().tags.list();

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("Travel");
    expect(result[0]!.color).toBe("#3B82F6");
    expect(result[0]!.transactionCount).toBe(0);
  });

  it("returns correct transaction counts and orders tags by name", async () => {
    const db = makeDb();
    const caller = makeCaller();

    const travel = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    const food = await caller.tags.create({ name: "Food", color: "#10B981" });
    const work = await caller.tags.create({ name: "Work", color: "#F59E0B" });

    await db.insert(transactions).values([
      { id: "tx-1", date: "2024-01-01", description: "A", amount: 1, type: "DEBIT" },
      { id: "tx-2", date: "2024-01-02", description: "B", amount: 2, type: "DEBIT" },
      { id: "tx-3", date: "2024-01-03", description: "C", amount: 3, type: "DEBIT" }
    ]);
    await db.insert(transactionTags).values([
      { transactionId: "tx-1", tagId: travel.id },
      { transactionId: "tx-2", tagId: travel.id },
      { transactionId: "tx-3", tagId: food.id }
    ]);

    const result = await caller.tags.list();

    expect(result.map((t) => t.name)).toEqual(["Food", "Travel", "Work"]);
    expect(result.find((t) => t.name === "Travel")!.transactionCount).toBe(2);
    expect(result.find((t) => t.name === "Food")!.transactionCount).toBe(1);
    expect(result.find((t) => t.name === "Work")!.transactionCount).toBe(0);
    expect(work).toBeTruthy();
  });
});

describe("tags.create", () => {
  it("creates a tag and returns it with a generated id", async () => {
    const created = await makeCaller().tags.create({ name: "Travel", color: "#3B82F6" });

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Travel");
    expect(created.color).toBe("#3B82F6");
    expect(created.createdAt).toBeTruthy();

    const persisted = await makeDb().select().from(tags).where(eq(tags.id, created.id));
    expect(persisted).toHaveLength(1);
    expect(persisted[0]!.name).toBe("Travel");
  });

  it("throws CONFLICT when the name already exists", async () => {
    const caller = makeCaller();
    await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await expect(caller.tags.create({ name: "Travel", color: "#FF0000" })).rejects.toMatchObject({
      code: "CONFLICT"
    });
  });

  it("input schema rejects empty name (after trim)", () => {
    const result = createTagInputSchema.safeParse({ name: "   ", color: "#3B82F6" });
    expect(result.success).toBe(false);
  });

  it("input schema rejects color that is not a #RRGGBB hex string", () => {
    expect(createTagInputSchema.safeParse({ name: "Travel", color: "blue" }).success).toBe(false);
    expect(createTagInputSchema.safeParse({ name: "Travel", color: "#abc" }).success).toBe(false);
    expect(createTagInputSchema.safeParse({ name: "Travel", color: "#GGGGGG" }).success).toBe(false);
  });

  it("trims whitespace around the name", async () => {
    const created = await makeCaller().tags.create({ name: "  Travel  ", color: "#3B82F6" });
    expect(created.name).toBe("Travel");
  });
});

describe("tags.delete", () => {
  it("removes the tag and returns deletedId", async () => {
    const caller = makeCaller();
    const created = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    const result = await caller.tags.delete({ id: created.id });

    expect(result.deletedId).toBe(created.id);
    const remaining = await makeDb().select().from(tags).where(eq(tags.id, created.id));
    expect(remaining).toHaveLength(0);
  });

  it("throws NOT_FOUND when the tag does not exist", async () => {
    await expect(makeCaller().tags.delete({ id: "missing-id" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("cascades: transaction_tags rows for the deleted tag are removed", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await db
      .insert(transactions)
      .values({ id: "tx-cascade-1", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });
    await db.insert(transactionTags).values({ transactionId: "tx-cascade-1", tagId: tag.id });

    await caller.tags.delete({ id: tag.id });

    const remaining = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(remaining).toHaveLength(0);
  });
});

describe("tags.assignToTransactions", () => {
  it("assigns a tag to multiple transactions", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await db.insert(transactions).values([
      { id: "tx-a", date: "2024-01-01", description: "a", amount: 1, type: "DEBIT" },
      { id: "tx-b", date: "2024-01-02", description: "b", amount: 2, type: "DEBIT" }
    ]);

    const result = await caller.tags.assignToTransactions({
      tagId: tag.id,
      transactionIds: ["tx-a", "tx-b"]
    });

    expect(result.assigned).toBe(2);
    const rows = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(rows.map((r) => r.transactionId).sort()).toEqual(["tx-a", "tx-b"]);
  });

  it("is idempotent: re-assigning the same tag does not error or duplicate rows", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await db
      .insert(transactions)
      .values({ id: "tx-idem", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });

    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["tx-idem"] });
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["tx-idem"] });

    const rows = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(rows).toHaveLength(1);
  });

  it("throws NOT_FOUND when tagId does not exist", async () => {
    const db = makeDb();
    await db
      .insert(transactions)
      .values({ id: "tx-x", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });

    await expect(
      makeCaller().tags.assignToTransactions({ tagId: "missing-tag", transactionIds: ["tx-x"] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("handles batches larger than the per-statement param limit", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Bulk", color: "#3B82F6" });

    const txValues = Array.from({ length: 150 }, (_, i) => ({
      id: `tx-bulk-${i}`,
      date: "2024-01-01",
      description: `bulk-${i}`,
      amount: 1,
      type: "DEBIT" as const
    }));
    // Insert transactions in chunks of 10 to respect the same D1 param limits
    for (let i = 0; i < txValues.length; i += 10) {
      await db.insert(transactions).values(txValues.slice(i, i + 10));
    }

    const result = await caller.tags.assignToTransactions({
      tagId: tag.id,
      transactionIds: txValues.map((t) => t.id)
    });

    expect(result.assigned).toBe(150);
    const rows = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(rows).toHaveLength(150);
  });
});

describe("tags.removeFromTransactions", () => {
  it("removes the tag link from the specified transactions", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await db.insert(transactions).values([
      { id: "tx-r1", date: "2024-01-01", description: "a", amount: 1, type: "DEBIT" },
      { id: "tx-r2", date: "2024-01-02", description: "b", amount: 2, type: "DEBIT" }
    ]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["tx-r1", "tx-r2"] });

    const result = await caller.tags.removeFromTransactions({ tagId: tag.id, transactionIds: ["tx-r1"] });

    expect(result.removed).toBe(1);
    const remaining = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(remaining.map((r) => r.transactionId)).toEqual(["tx-r2"]);
  });

  it("is a no-op when transactions are not tagged", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    await db
      .insert(transactions)
      .values({ id: "tx-noop", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });

    const result = await caller.tags.removeFromTransactions({ tagId: tag.id, transactionIds: ["tx-noop"] });
    expect(result.removed).toBe(1);
  });

  it("does not affect other tags on the same transaction", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const travel = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    const food = await caller.tags.create({ name: "Food", color: "#10B981" });

    await db
      .insert(transactions)
      .values({ id: "tx-multi", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });
    await caller.tags.assignToTransactions({ tagId: travel.id, transactionIds: ["tx-multi"] });
    await caller.tags.assignToTransactions({ tagId: food.id, transactionIds: ["tx-multi"] });

    await caller.tags.removeFromTransactions({ tagId: travel.id, transactionIds: ["tx-multi"] });

    const remaining = await db.select().from(transactionTags).where(eq(transactionTags.transactionId, "tx-multi"));
    expect(remaining.map((r) => r.tagId)).toEqual([food.id]);
  });

  it("handles batches larger than the per-statement param limit", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Bulk", color: "#3B82F6" });

    const txValues = Array.from({ length: 150 }, (_, i) => ({
      id: `tx-rm-bulk-${i}`,
      date: "2024-01-01",
      description: `bulk-${i}`,
      amount: 1,
      type: "DEBIT" as const
    }));
    for (let i = 0; i < txValues.length; i += 10) {
      await db.insert(transactions).values(txValues.slice(i, i + 10));
    }
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: txValues.map((t) => t.id) });

    const result = await caller.tags.removeFromTransactions({
      tagId: tag.id,
      transactionIds: txValues.map((t) => t.id)
    });

    expect(result.removed).toBe(150);
    const remaining = await db.select().from(transactionTags).where(eq(transactionTags.tagId, tag.id));
    expect(remaining).toHaveLength(0);
  });
});

describe("tags.getReport", () => {
  it("returns an empty report for a tag with no transactions", async () => {
    const caller = makeCaller();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.tag.id).toBe(tag.id);
    expect(report.tag.name).toBe("Travel");
    expect(report.totalIncome).toBe(0);
    expect(report.totalSpend).toBe(0);
    expect(report.net).toBe(0);
    expect(report.byCategory).toEqual([]);
    expect(report.transactions).toEqual([]);
    expect(report.dateRange).toBeNull();
  });

  it("throws NOT_FOUND when the tag does not exist", async () => {
    await expect(makeCaller().tags.getReport({ tagId: "missing-tag-id" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });

  it("totals income, spend, and net, and groups by category for tagged transactions", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [hotel] = await db.insert(categories).values({ name: "Hotel", groupType: "FIXED" }).returning();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values([
      // Income: refund as CREDIT in INCOME
      { id: "ny-1", date: "2024-03-04", description: "Refund", amount: 50, type: "CREDIT", categoryId: salary!.id },
      // Fixed expense: hotel
      { id: "ny-2", date: "2024-03-05", description: "Hotel", amount: 600, type: "DEBIT", categoryId: hotel!.id },
      // Variable expense: dinner x 2
      { id: "ny-3", date: "2024-03-06", description: "Dinner", amount: 80, type: "DEBIT", categoryId: food!.id },
      { id: "ny-4", date: "2024-03-07", description: "Lunch", amount: 40, type: "DEBIT", categoryId: food!.id }
    ]);
    await caller.tags.assignToTransactions({
      tagId: tag.id,
      transactionIds: ["ny-1", "ny-2", "ny-3", "ny-4"]
    });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.totalIncome).toBe(50);
    expect(report.totalSpend).toBe(720);
    expect(report.net).toBe(-670);
    const byCat = Object.fromEntries(report.byCategory.map((c) => [c.categoryName, c]));
    expect(byCat.Salary).toEqual({
      categoryId: salary!.id,
      categoryName: "Salary",
      groupType: "INCOME",
      total: 50
    });
    expect(byCat.Hotel).toEqual({
      categoryId: hotel!.id,
      categoryName: "Hotel",
      groupType: "FIXED",
      total: 600
    });
    expect(byCat.Food).toEqual({
      categoryId: food!.id,
      categoryName: "Food",
      groupType: "VARIABLE",
      total: 120
    });
  });

  it("excludes IGNORED-category transactions from totals and byCategory", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [transfer] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();

    await db.insert(transactions).values([
      { id: "ig-1", date: "2024-03-05", description: "Dinner", amount: 80, type: "DEBIT", categoryId: food!.id },
      { id: "ig-2", date: "2024-03-06", description: "Transfer", amount: 500, type: "DEBIT", categoryId: transfer!.id }
    ]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["ig-1", "ig-2"] });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.totalSpend).toBe(80);
    expect(report.net).toBe(-80);
    expect(report.byCategory.map((c) => c.categoryName)).toEqual(["Food"]);
  });

  it("excludes uncategorized tagged transactions from totals and byCategory", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values([
      { id: "u-1", date: "2024-03-05", description: "Dinner", amount: 80, type: "DEBIT", categoryId: food!.id },
      { id: "u-2", date: "2024-03-06", description: "Mystery", amount: 30, type: "DEBIT", categoryId: null }
    ]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["u-1", "u-2"] });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.totalSpend).toBe(80);
    expect(report.byCategory.map((c) => c.categoryName)).toEqual(["Food"]);
  });

  it("excludes only the requested tag's transactions, ignoring other tags", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const ny = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const work = await caller.tags.create({ name: "Work", color: "#10B981" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values([
      { id: "iso-1", date: "2024-03-05", description: "NY Dinner", amount: 80, type: "DEBIT", categoryId: food!.id },
      { id: "iso-2", date: "2024-03-06", description: "Work Lunch", amount: 30, type: "DEBIT", categoryId: food!.id }
    ]);
    await caller.tags.assignToTransactions({ tagId: ny.id, transactionIds: ["iso-1"] });
    await caller.tags.assignToTransactions({ tagId: work.id, transactionIds: ["iso-2"] });

    const report = await caller.tags.getReport({ tagId: ny.id });

    expect(report.totalSpend).toBe(80);
    expect(report.transactions.map((t) => t.id)).toEqual(["iso-1"]);
  });

  it("attaches all assigned tags onto each returned transaction", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const ny = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const food = await caller.tags.create({ name: "Foodie", color: "#10B981" });
    const [foodCat] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values({
      id: "tx-multi",
      date: "2024-03-05",
      description: "Dinner",
      amount: 50,
      type: "DEBIT",
      categoryId: foodCat!.id
    });
    await caller.tags.assignToTransactions({ tagId: ny.id, transactionIds: ["tx-multi"] });
    await caller.tags.assignToTransactions({ tagId: food.id, transactionIds: ["tx-multi"] });

    const report = await caller.tags.getReport({ tagId: ny.id });

    expect(report.transactions).toHaveLength(1);
    const tagNames = report.transactions[0]!.tags.map((t) => t.name).sort();
    expect(tagNames).toEqual(["Foodie", "NY Trip"]);
  });

  it("derives dateRange from earliest and latest transaction dates (including IGNORED)", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [ignored] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();

    await db.insert(transactions).values([
      { id: "d-1", date: "2024-03-09", description: "Late", amount: 10, type: "DEBIT", categoryId: food!.id },
      { id: "d-2", date: "2024-03-03", description: "Early", amount: 10, type: "DEBIT", categoryId: food!.id },
      { id: "d-3", date: "2024-03-06", description: "Middle", amount: 10, type: "DEBIT", categoryId: ignored!.id }
    ]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["d-1", "d-2", "d-3"] });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.dateRange).toEqual({ from: "2024-03-03", to: "2024-03-09" });
  });

  it("rounds totals to 2 decimal places to avoid floating-point drift", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "FP", color: "#3B82F6" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values([
      { id: "fp-1", date: "2024-03-05", description: "a", amount: 0.1, type: "DEBIT", categoryId: food!.id },
      { id: "fp-2", date: "2024-03-06", description: "b", amount: 0.2, type: "DEBIT", categoryId: food!.id }
    ]);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["fp-1", "fp-2"] });

    const report = await caller.tags.getReport({ tagId: tag.id });

    expect(report.totalSpend).toBe(0.3);
    expect(report.byCategory[0]!.total).toBe(0.3);
  });
});

describe("tags.getReportByName", () => {
  it("matches case-insensitively and returns the same TagReport shape", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "NY Trip", color: "#3B82F6" });
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db.insert(transactions).values({
      id: "n-1",
      date: "2024-03-05",
      description: "Dinner",
      amount: 50,
      type: "DEBIT",
      categoryId: food!.id
    });
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: ["n-1"] });

    const report = await caller.tags.getReportByName({ name: "ny trip" });

    expect(report.tag.id).toBe(tag.id);
    expect(report.totalSpend).toBe(50);
  });

  it("matches a partial substring of the tag name", async () => {
    const caller = makeCaller();
    const tag = await caller.tags.create({ name: "New York 2026", color: "#3B82F6" });

    const report = await caller.tags.getReportByName({ name: "york" });

    expect(report.tag.id).toBe(tag.id);
  });

  it("prefers the shortest matching tag when multiple tags match", async () => {
    const caller = makeCaller();
    const food = await caller.tags.create({ name: "Food", color: "#3B82F6" });
    await caller.tags.create({ name: "Food Delivery", color: "#10B981" });
    await caller.tags.create({ name: "Foodie Travel", color: "#F59E0B" });

    const report = await caller.tags.getReportByName({ name: "food" });

    expect(report.tag.id).toBe(food.id);
    expect(report.tag.name).toBe("Food");
  });

  it("throws NOT_FOUND when no tag matches the name", async () => {
    const caller = makeCaller();
    await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    await expect(caller.tags.getReportByName({ name: "nonexistent" })).rejects.toMatchObject({
      code: "NOT_FOUND"
    });
  });
});

describe("transactions.list with tags", () => {
  it("returns tags: [] for transactions with no tags", async () => {
    await makeDb()
      .insert(transactions)
      .values({ id: "tx-untagged", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });

    const result = await makeCaller().transactions.list({});

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.tags).toEqual([]);
  });

  it("includes assigned tags on each transaction, scoped per row", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const travel = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    const food = await caller.tags.create({ name: "Food", color: "#10B981" });

    await db.insert(transactions).values([
      { id: "tx-t1", date: "2024-01-02", description: "a", amount: 1, type: "DEBIT" },
      { id: "tx-t2", date: "2024-01-01", description: "b", amount: 2, type: "DEBIT" }
    ]);
    await caller.tags.assignToTransactions({ tagId: travel.id, transactionIds: ["tx-t1", "tx-t2"] });
    await caller.tags.assignToTransactions({ tagId: food.id, transactionIds: ["tx-t1"] });

    const result = await caller.transactions.list({});

    const t1 = result.rows.find((r) => r.id === "tx-t1")!;
    const t2 = result.rows.find((r) => r.id === "tx-t2")!;
    expect(t1.tags.map((t) => t.name).sort()).toEqual(["Food", "Travel"]);
    expect(t2.tags.map((t) => t.name)).toEqual(["Travel"]);
  });

  it("tags carry id, name, color, and createdAt", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const travel = await caller.tags.create({ name: "Travel", color: "#3B82F6" });
    await db
      .insert(transactions)
      .values({ id: "tx-shape", date: "2024-01-01", description: "x", amount: 1, type: "DEBIT" });
    await caller.tags.assignToTransactions({ tagId: travel.id, transactionIds: ["tx-shape"] });

    const result = await caller.transactions.list({});

    expect(result.rows[0]!.tags[0]).toEqual({
      id: travel.id,
      name: "Travel",
      color: "#3B82F6",
      createdAt: travel.createdAt
    });
  });

  it("preserves pagination when tags are loaded", async () => {
    const caller = makeCaller();
    const db = makeDb();
    const tag = await caller.tags.create({ name: "Travel", color: "#3B82F6" });

    const txValues = Array.from({ length: 5 }, (_, i) => ({
      id: `tx-page-${i}`,
      date: `2024-01-0${i + 1}`,
      description: `d${i}`,
      amount: 1,
      type: "DEBIT" as const
    }));
    await db.insert(transactions).values(txValues);
    await caller.tags.assignToTransactions({ tagId: tag.id, transactionIds: txValues.map((t) => t.id) });

    const page1 = await caller.transactions.list({ limit: 2, offset: 0 });
    const page2 = await caller.transactions.list({ limit: 2, offset: 2 });

    expect(page1.rows).toHaveLength(2);
    expect(page2.rows).toHaveLength(2);
    expect(page1.total).toBe(5);
    for (const row of [...page1.rows, ...page2.rows]) {
      expect(row.tags).toHaveLength(1);
      expect(row.tags[0]!.name).toBe("Travel");
    }
  });
});
