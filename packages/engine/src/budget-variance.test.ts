import { describe, expect, it } from "vitest";

import { buildBudgetVarianceRows } from "./budget-variance";
import { buildCashflowTrend } from "./cashflow";

import type { RollupCell } from "./rollup-cell";

const cell = (over: Partial<RollupCell>): RollupCell => ({
  month: "2026-01",
  categoryId: 20,
  categoryName: "Groceries",
  groupType: "VARIABLE",
  accountId: "acc-1",
  accountName: "Account 1",
  cents: 0,
  rowCount: 1,
  ...over
});

describe("buildBudgetVarianceRows", () => {
  const trailing = (categoryId: number, name: string, group: "FIXED" | "VARIABLE", perMonthCents: number) => [
    cell({ month: "2026-01", categoryId, categoryName: name, groupType: group, cents: perMonthCents }),
    cell({ month: "2026-02", categoryId, categoryName: name, groupType: group, cents: perMonthCents }),
    cell({ month: "2026-03", categoryId, categoryName: name, groupType: group, cents: perMonthCents })
  ];

  it("labels OVER/UNDER/ON_TRACK against the ±10% threshold", () => {
    const cells = [
      // Food: avg 100, actual 200 → OVER
      ...trailing(20, "Food", "VARIABLE", 10000),
      cell({ month: "2026-04", categoryId: 20, categoryName: "Food", cents: 20000 }),
      // Rent: avg 1500, actual 1500 → ON_TRACK
      ...trailing(10, "Rent", "FIXED", 150000),
      cell({ month: "2026-04", categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 150000 }),
      // Fun: avg 50, actual 0 → UNDER
      ...trailing(25, "Fun", "VARIABLE", 5000)
    ];

    const rows = buildBudgetVarianceRows("2026-04", 3, cells);
    const byName = Object.fromEntries(rows.map((r) => [r.categoryName, r]));

    expect(byName.Food).toMatchObject({ trailingAvg: 100, actual: 200, variance: 100, status: "OVER" });
    expect(byName.Rent).toMatchObject({ trailingAvg: 1500, actual: 1500, variance: 0, status: "ON_TRACK" });
    expect(byName.Fun).toMatchObject({ trailingAvg: 50, actual: 0, variance: -50, status: "UNDER" });
  });

  it("stays ON_TRACK within the threshold and flips just past it", () => {
    const cells = [
      ...trailing(20, "Food", "VARIABLE", 10000),
      cell({ month: "2026-04", categoryId: 20, categoryName: "Food", cents: 10900 }), // +9% → ON_TRACK
      ...trailing(21, "Dining", "VARIABLE", 10000),
      cell({ month: "2026-04", categoryId: 21, categoryName: "Dining", cents: 11100 }) // +11% → OVER
    ];

    const rows = buildBudgetVarianceRows("2026-04", 3, cells);
    const byName = Object.fromEntries(rows.map((r) => [r.categoryName, r]));
    expect(byName.Food!.status).toBe("ON_TRACK");
    expect(byName.Dining!.status).toBe("OVER");
  });

  it("labels new spend with no trailing history as OVER, and none-at-all as ON_TRACK", () => {
    const cells = [cell({ month: "2026-04", categoryId: 30, categoryName: "New", cents: 5000 })];
    const rows = buildBudgetVarianceRows("2026-04", 3, cells);
    expect(rows[0]).toMatchObject({ trailingAvg: 0, actual: 50, status: "OVER" });
  });

  it("ignores INCOME/IGNORED/uncategorized cells and sorts by absolute variance", () => {
    const cells = [
      cell({ month: "2026-04", categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 500000 }),
      cell({ month: "2026-04", categoryId: 30, categoryName: "Transfer", groupType: "IGNORED", cents: 100000 }),
      cell({ month: "2026-04", categoryId: null, categoryName: null, groupType: null, cents: 77700 }),
      cell({ month: "2026-04", categoryId: 20, categoryName: "Small", cents: 1000 }),
      cell({ month: "2026-04", categoryId: 21, categoryName: "Big", cents: 100000 })
    ];
    const rows = buildBudgetVarianceRows("2026-04", 3, cells);
    expect(rows.map((r) => r.categoryName)).toEqual(["Big", "Small"]);
  });
});

describe("buildCashflowTrend", () => {
  it("zero-fills months with no data and keeps the requested order", () => {
    const points = buildCashflowTrend(
      ["2026-01", "2026-02", "2026-03"],
      [
        cell({ month: "2026-02", categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 500000 }),
        cell({ month: "2026-02", categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 150000 }),
        cell({ month: "2026-03", categoryId: 20, cents: 30000 })
      ]
    );

    expect(points).toEqual([
      { month: "2026-01", income: 0, expenses: 0, net: 0 },
      { month: "2026-02", income: 5000, expenses: 1500, net: 3500 },
      { month: "2026-03", income: 0, expenses: 300, net: -300 }
    ]);
  });

  it("excludes IGNORED and uncategorized cells from every column", () => {
    const points = buildCashflowTrend(
      ["2026-01"],
      [
        cell({ categoryId: 30, categoryName: "Transfer", groupType: "IGNORED", cents: 999900 }),
        cell({ categoryId: null, categoryName: null, groupType: null, cents: 55500 }),
        cell({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 100000 })
      ]
    );
    expect(points).toEqual([{ month: "2026-01", income: 1000, expenses: 0, net: 1000 }]);
  });
});
