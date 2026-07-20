import { describe, expect, it } from "vitest";

import { buildMonthlyPnL, getSavingsRateBenchmark } from "./monthly-pnl";

import type { RollupCell } from "./rollup-cell";

const cell = (over: Partial<RollupCell>): RollupCell => ({
  month: "2026-01",
  categoryId: 1,
  categoryName: "Category 1",
  groupType: "VARIABLE",
  accountId: "acc-1",
  accountName: "Account 1",
  cents: 0,
  rowCount: 1,
  ...over
});

describe("buildMonthlyPnL", () => {
  it("sums income from INCOME-category cells", () => {
    const cells = [
      cell({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 100000 }),
      cell({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 50000, accountId: "acc-2" })
    ];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.income.total).toBe(1500);
    expect(pnl.income.items).toEqual([{ categoryId: 1, categoryName: "Salary", total: 1500 }]);
    expect(pnl.currency).toBe("MXN");
  });

  it("splits fixed and variable expenses and totals them per category", () => {
    const cells = [
      cell({ categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 80000 }),
      cell({ categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", cents: 30000 })
    ];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.fixed.total).toBe(800);
    expect(pnl.variable.total).toBe(300);
  });

  it("computes net as income minus fixed minus variable", () => {
    const cells = [
      cell({ categoryId: 1, groupType: "INCOME", cents: 200000 }),
      cell({ categoryId: 10, groupType: "FIXED", cents: 80000 })
    ];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.net).toBe(1200);
  });

  it("computes savingsRate at 4dp precision (D7)", () => {
    const cells = [
      cell({ categoryId: 1, groupType: "INCOME", cents: 200000 }),
      cell({ categoryId: 10, groupType: "FIXED", cents: 48700 })
    ];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    // (2000 - 487) / 2000 = 0.7565 — 2dp rounding would flatten this to 0.76
    expect(pnl.savingsRate).toBe(0.7565);
  });

  it("returns null savingsRate when income is zero", () => {
    const cells = [cell({ categoryId: 10, groupType: "FIXED", cents: 50000 })];
    expect(buildMonthlyPnL("2026-01", cells, "MXN").savingsRate).toBeNull();
  });

  it("totals IGNORED categories separately, excluded from net", () => {
    const cells = [cell({ categoryId: 30, categoryName: "Transfers", groupType: "IGNORED", cents: 999900 })];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.ignored.total).toBe(9999);
    expect(pnl.net).toBe(0);
    expect(pnl.income.total).toBe(0);
  });

  it("excludes uncategorized cells from all totals", () => {
    const cells = [cell({ categoryId: null, categoryName: null, groupType: null, cents: 999900 })];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.net).toBe(0);
    expect(pnl.variable.total).toBe(0);
  });

  it("ignores cells from other months", () => {
    const cells = [
      cell({ month: "2026-01", categoryId: 1, groupType: "INCOME", cents: 100000 }),
      cell({ month: "2026-02", categoryId: 1, groupType: "INCOME", cents: 700000 })
    ];
    expect(buildMonthlyPnL("2026-01", cells, "MXN").income.total).toBe(1000);
  });

  it("counts every transaction in a category regardless of bank type (LAG-46 / ADR-0002)", () => {
    // Cells arrive pre-summed across DEBIT and CREDIT rows: a credit-card
    // charge imported as CREDIT lands in the same cell as DEBIT charges.
    // The engine must never re-split by bank type — one cell, one total.
    const cells = [cell({ categoryId: 21, categoryName: "Dining", groupType: "VARIABLE", cents: 45000, rowCount: 3 })];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.variable.items[0]!.total).toBe(450);
  });

  it("treats refunds as income via the Refunds category (ADR-0002)", () => {
    const cells = [
      cell({ categoryId: 23, categoryName: "Shopping", groupType: "VARIABLE", cents: 200000 }),
      cell({ categoryId: 7, categoryName: "Refunds", groupType: "INCOME", cents: 200000 })
    ];
    const pnl = buildMonthlyPnL("2026-01", cells, "MXN");
    expect(pnl.variable.total).toBe(2000);
    expect(pnl.income.total).toBe(2000);
    expect(pnl.net).toBe(0);
  });
});

describe("getSavingsRateBenchmark", () => {
  it("labels rates against the 10%/20% thresholds", () => {
    expect(getSavingsRateBenchmark(null)).toBeNull();
    expect(getSavingsRateBenchmark(0.25)).toBe("HEALTHY");
    expect(getSavingsRateBenchmark(0.15)).toBe("WATCH");
    expect(getSavingsRateBenchmark(0.05)).toBe("DANGER");
  });
});
