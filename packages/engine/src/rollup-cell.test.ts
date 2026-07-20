import { describe, expect, it } from "vitest";

import { rankMerchantsByVolume, summarizeMerchants } from "./merchants";
import { expenseCells, incomeCells, inGroup, inMonth, sumByCategory, sumCents } from "./rollup-cell";
import { buildSpendingByCategoryRows } from "./spending";

import type { MerchantCell } from "./merchants";
import type { RollupCell } from "./rollup-cell";

const cell = (over: Partial<RollupCell>): RollupCell => ({
  month: "2026-01",
  categoryId: 20,
  categoryName: "Groceries",
  groupType: "VARIABLE",
  accountId: "acc-1",
  accountName: "Account 1",
  cents: 1000,
  rowCount: 1,
  ...over
});

describe("direction selectors (ADR-0002)", () => {
  const cells = [
    cell({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 500000 }),
    cell({ categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 150000 }),
    cell({ categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", cents: 30000 }),
    cell({ categoryId: 30, categoryName: "Transfer", groupType: "IGNORED", cents: 99900 }),
    cell({ categoryId: null, categoryName: null, groupType: null, cents: 55500 }),
    cell({ month: "2026-02", categoryId: 20, cents: 7000 })
  ];

  it("incomeCells keeps only categorized INCOME cells", () => {
    expect(incomeCells(cells).map((c) => c.categoryId)).toEqual([1]);
  });

  it("expenseCells keeps FIXED + VARIABLE, dropping IGNORED and uncategorized", () => {
    expect(sumCents(expenseCells(cells))).toBe(150000 + 30000 + 7000);
  });

  it("inMonth and inGroup compose", () => {
    expect(sumCents(expenseCells(inMonth(cells, "2026-02")))).toBe(7000);
    expect(inGroup(cells, "IGNORED").map((c) => c.categoryId)).toEqual([30]);
  });

  it("sumByCategory folds cells across months and accounts", () => {
    const rows = sumByCategory(expenseCells(cells));
    expect(rows).toEqual([
      { categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 150000 },
      { categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", cents: 30000 + 7000 }
    ]);
  });
});

describe("buildSpendingByCategoryRows", () => {
  it("returns expense categories in major units, largest first", () => {
    const rows = buildSpendingByCategoryRows([
      cell({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 500000 }),
      cell({ categoryId: 20, categoryName: "Groceries", cents: 30000 }),
      cell({ categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 150000 }),
      cell({ categoryId: 20, categoryName: "Groceries", accountId: "acc-2", cents: 2050 })
    ]);
    expect(rows).toEqual([
      { categoryId: 10, categoryName: "Rent", groupType: "FIXED", total: 1500 },
      { categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", total: 320.5 }
    ]);
  });
});

describe("merchant cells", () => {
  const mcell = (merchant: string, over: Partial<MerchantCell> = {}): MerchantCell => ({
    merchant,
    month: "2026-01",
    cents: 1000,
    rowCount: 1,
    ...over
  });

  it("summarizeMerchants folds across months", () => {
    const totals = summarizeMerchants([
      mcell("OXXO", { cents: 5000, rowCount: 2 }),
      mcell("OXXO", { month: "2026-02", cents: 2500, rowCount: 1 }),
      mcell("UBER", { cents: 9900, rowCount: 3 })
    ]);
    expect(totals).toEqual([
      { merchant: "OXXO", count: 3, cents: 7500 },
      { merchant: "UBER", count: 3, cents: 9900 }
    ]);
  });

  it("rankMerchantsByVolume sorts by total and caps at limit", () => {
    const rows = rankMerchantsByVolume(
      [mcell("A", { cents: 100 }), mcell("B", { cents: 300 }), mcell("C", { cents: 200 })],
      2
    );
    expect(rows).toEqual([
      { merchant: "B", count: 1, total: 3 },
      { merchant: "C", count: 1, total: 2 }
    ]);
  });
});
