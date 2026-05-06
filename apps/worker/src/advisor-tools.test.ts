import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@pnl/types";
import {
  accounts,
  cardBenefits,
  categories,
  columnMappings,
  getBudgetVariance,
  getCashflowTrend,
  getCategoryList,
  getFinancialHealthSnapshot,
  transactions
} from "@pnl/types";

const TEST_ACCOUNT_ID = "test-account-00000000-0000-0000-0000";

function makeDb() {
  return drizzle(env.DB, { schema });
}

beforeEach(async () => {
  const db = makeDb();
  await db.delete(transactions);
  await db.delete(columnMappings);
  await db.delete(cardBenefits);
  await db.delete(accounts);
  await db.delete(categories);
  await db.insert(accounts).values({
    id: TEST_ACCOUNT_ID,
    name: "Test Bank",
    institution: "Test Bank",
    type: "CHECKING",
    color: "#3b82f6",
    createdAt: new Date().toISOString()
  });
});

const baseTx = (overrides: Partial<typeof transactions.$inferInsert>) => ({
  id: "tx-1",
  date: "2024-01-15",
  description: "Coffee",
  amount: 4.5,
  type: "DEBIT" as const,
  accountId: TEST_ACCOUNT_ID,
  sourceFile: "bank.csv",
  rawRow: "{}",
  createdAt: new Date().toISOString(),
  ...overrides
});

describe("getFinancialHealthSnapshot", () => {
  it("returns labels and delta against the previous month", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [rent] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db.insert(transactions).values([
      // previous month: 5000 income, 1500 rent, 500 food → net 3000
      baseTx({ id: "p-sal", date: "2024-02-01", amount: 5000, type: "CREDIT", categoryId: salary!.id }),
      baseTx({ id: "p-rent", date: "2024-02-02", amount: 1500, categoryId: rent!.id }),
      baseTx({ id: "p-food", date: "2024-02-15", amount: 500, categoryId: food!.id }),
      // current month: 6000 income, 1500 rent, 800 food → net 3700
      baseTx({ id: "c-sal", date: "2024-03-01", amount: 6000, type: "CREDIT", categoryId: salary!.id }),
      baseTx({ id: "c-rent", date: "2024-03-02", amount: 1500, categoryId: rent!.id }),
      baseTx({ id: "c-food", date: "2024-03-10", amount: 800, categoryId: food!.id })
    ]);

    const result = await getFinancialHealthSnapshot(db, new Date(Date.UTC(2024, 2, 20)));

    expect(result.month).toBe("2024-03");
    expect(result.net).toBe(3700);
    expect(result.netLabel).toBe("IN_THE_GREEN");
    expect(result.savingsRate).toBeCloseTo(0.62, 2);
    expect(result.savingsLabel).toBe("HEALTHY");
    expect(result.biggestExpense).toEqual({ name: "Rent", total: 1500 });
    expect(result.vsLastMonth).toEqual({ delta: 700, label: "BETTER" });
    expect(result.data_quality).toEqual({ uncategorized_count: 0, uncategorized_pct: 0, warning: false });
  });

  it("flags data quality warning when more than 5% are uncategorized", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([
        baseTx({ id: "u1", date: "2024-03-01" }),
        baseTx({ id: "u2", date: "2024-03-02" }),
        baseTx({ id: "f1", date: "2024-03-03", amount: 25, categoryId: food!.id })
      ]);

    const result = await getFinancialHealthSnapshot(db, new Date(Date.UTC(2024, 2, 5)));

    expect(result.data_quality.uncategorized_count).toBe(2);
    expect(result.data_quality.uncategorized_pct).toBeCloseTo(66.67, 1);
    expect(result.data_quality.warning).toBe(true);
  });

  it("returns vsLastMonth=null when no previous-month data exists", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    await db
      .insert(transactions)
      .values([baseTx({ id: "c-sal", date: "2024-03-01", amount: 1000, type: "CREDIT", categoryId: salary!.id })]);

    const result = await getFinancialHealthSnapshot(db, new Date(Date.UTC(2024, 2, 5)));

    expect(result.vsLastMonth).toBeNull();
  });
});

describe("getBudgetVariance", () => {
  it("computes trailing 3-month average and labels OVER/UNDER/ON_TRACK", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    const [rent] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();
    const [fun] = await db.insert(categories).values({ name: "Fun", groupType: "VARIABLE" }).returning();

    // Split into batches of ≤9 rows to stay within D1's 100 SQL variable limit (10 cols × 9 = 90)
    await db.insert(transactions).values([
      // Trailing months: Jan/Feb/Mar 2024
      baseTx({ id: "f1", date: "2024-01-10", amount: 100, categoryId: food!.id }),
      baseTx({ id: "f2", date: "2024-02-10", amount: 100, categoryId: food!.id }),
      baseTx({ id: "f3", date: "2024-03-10", amount: 100, categoryId: food!.id }),
      // Rent flat
      baseTx({ id: "r1", date: "2024-01-01", amount: 1500, categoryId: rent!.id }),
      baseTx({ id: "r2", date: "2024-02-01", amount: 1500, categoryId: rent!.id }),
      baseTx({ id: "r3", date: "2024-03-01", amount: 1500, categoryId: rent!.id }),
      baseTx({ id: "r4", date: "2024-04-01", amount: 1500, categoryId: rent!.id }),
      // Fun: trailing avg 50, current 0 → UNDER
      baseTx({ id: "fun1", date: "2024-01-05", amount: 50, categoryId: fun!.id }),
      baseTx({ id: "fun2", date: "2024-02-05", amount: 50, categoryId: fun!.id })
    ]);
    await db.insert(transactions).values([
      baseTx({ id: "fun3", date: "2024-03-05", amount: 50, categoryId: fun!.id }),
      // Current month food: 200 → OVER (avg 100)
      baseTx({ id: "f4", date: "2024-04-10", amount: 200, categoryId: food!.id })
    ]);

    const result = await getBudgetVariance(db, "2024-04");

    expect(result.month).toBe("2024-04");
    expect(result.trailingMonths).toEqual(["2024-01", "2024-02", "2024-03"]);

    const byName = Object.fromEntries(result.rows.map((r) => [r.categoryName, r]));
    expect(byName.Food).toMatchObject({
      groupType: "VARIABLE",
      trailingAvg: 100,
      actual: 200,
      variance: 100,
      status: "OVER"
    });
    expect(byName.Rent).toMatchObject({
      groupType: "FIXED",
      trailingAvg: 1500,
      actual: 1500,
      variance: 0,
      status: "ON_TRACK"
    });
    expect(byName.Fun).toMatchObject({ trailingAvg: 50, actual: 0, status: "UNDER" });
  });

  it("excludes INCOME and IGNORED categories", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [transfer] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();

    await db
      .insert(transactions)
      .values([
        baseTx({ id: "s", date: "2024-04-01", amount: 5000, type: "CREDIT", categoryId: salary!.id }),
        baseTx({ id: "t", date: "2024-04-02", amount: 200, categoryId: transfer!.id }),
        baseTx({ id: "f", date: "2024-04-03", amount: 25, categoryId: food!.id })
      ]);

    const result = await getBudgetVariance(db, "2024-04");

    expect(result.rows.map((r) => r.categoryName)).toEqual(["Food"]);
  });
});

describe("getCashflowTrend", () => {
  it("returns the last N months oldest-first with income/expenses/net", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [rent] = await db.insert(categories).values({ name: "Rent", groupType: "FIXED" }).returning();

    await db
      .insert(transactions)
      .values([
        baseTx({ id: "s-feb", date: "2024-02-01", amount: 5000, type: "CREDIT", categoryId: salary!.id }),
        baseTx({ id: "r-feb", date: "2024-02-02", amount: 1500, categoryId: rent!.id }),
        baseTx({ id: "s-mar", date: "2024-03-01", amount: 6000, type: "CREDIT", categoryId: salary!.id }),
        baseTx({ id: "r-mar", date: "2024-03-02", amount: 1500, categoryId: rent!.id })
      ]);

    const result = await getCashflowTrend(db, 3, new Date(Date.UTC(2024, 2, 15)));

    expect(result.months).toEqual([
      { month: "2024-01", income: 0, expenses: 0, net: 0 },
      { month: "2024-02", income: 5000, expenses: 1500, net: 3500 },
      { month: "2024-03", income: 6000, expenses: 1500, net: 4500 }
    ]);
  });

  it("excludes IGNORED transactions from net", async () => {
    const db = makeDb();
    const [salary] = await db.insert(categories).values({ name: "Salary", groupType: "INCOME" }).returning();
    const [transfer] = await db.insert(categories).values({ name: "Transfer", groupType: "IGNORED" }).returning();

    await db
      .insert(transactions)
      .values([
        baseTx({ id: "s", date: "2024-03-01", amount: 5000, type: "CREDIT", categoryId: salary!.id }),
        baseTx({ id: "t", date: "2024-03-02", amount: 1000, categoryId: transfer!.id })
      ]);

    const result = await getCashflowTrend(db, 1, new Date(Date.UTC(2024, 2, 15)));

    expect(result.months).toEqual([{ month: "2024-03", income: 5000, expenses: 0, net: 5000 }]);
  });

  it("clamps requested months to [1, 24]", async () => {
    const db = makeDb();
    const result = await getCashflowTrend(db, 999, new Date(Date.UTC(2024, 2, 15)));
    expect(result.months).toHaveLength(24);
  });
});

describe("getCategoryList", () => {
  it("returns id/name/group_type/color in sortOrder", async () => {
    const db = makeDb();
    await db.insert(categories).values([
      { name: "Food", groupType: "VARIABLE", sortOrder: 2, color: "#ff0000" },
      { name: "Salary", groupType: "INCOME", sortOrder: 1, color: null }
    ]);

    const result = await getCategoryList(db);

    expect(result.rows.map((r) => r.name)).toEqual(["Salary", "Food"]);
    expect(result.rows[0]).toMatchObject({ name: "Salary", group_type: "INCOME", color: null });
    expect(result.rows[1]).toMatchObject({ name: "Food", group_type: "VARIABLE", color: "#ff0000" });
  });

  it("computes data_quality across all transactions", async () => {
    const db = makeDb();
    const [food] = await db.insert(categories).values({ name: "Food", groupType: "VARIABLE" }).returning();
    await db
      .insert(transactions)
      .values([baseTx({ id: "u", date: "2024-03-01" }), baseTx({ id: "c", date: "2024-03-02", categoryId: food!.id })]);

    const result = await getCategoryList(db);
    expect(result.data_quality.uncategorized_count).toBe(1);
    expect(result.data_quality.uncategorized_pct).toBe(50);
    expect(result.data_quality.warning).toBe(true);
  });
});
