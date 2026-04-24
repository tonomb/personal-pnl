import { describe, expect, it } from "vitest";

import {
  collectCategoryRows,
  formatMonthShort,
  getCategoryMonthTotal,
  getCategoryYtd,
  savingsRateClass
} from "./pnl-helpers";

import type { MonthlyPnL } from "@pnl/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMonth(month: string, overrides: Partial<MonthlyPnL> = {}): MonthlyPnL {
  return {
    month,
    income: { total: 0, items: [] },
    fixed: { total: 0, items: [] },
    variable: { total: 0, items: [] },
    ignored: { total: 0, items: [] },
    net: 0,
    savingsRate: null,
    ...overrides
  };
}

const JAN: MonthlyPnL = makeMonth("2025-01", {
  income: { total: 3000, items: [{ categoryId: 1, categoryName: "Salary", total: 3000 }] },
  fixed: { total: 1200, items: [{ categoryId: 2, categoryName: "Rent", total: 1200 }] },
  variable: {
    total: 400,
    items: [
      { categoryId: 3, categoryName: "Groceries", total: 250 },
      { categoryId: 4, categoryName: "Dining", total: 150 }
    ]
  },
  net: 1400,
  savingsRate: 0.467
});

const FEB: MonthlyPnL = makeMonth("2025-02", {
  income: { total: 3000, items: [{ categoryId: 1, categoryName: "Salary", total: 3000 }] },
  fixed: { total: 1200, items: [{ categoryId: 2, categoryName: "Rent", total: 1200 }] },
  variable: {
    total: 300,
    items: [
      { categoryId: 3, categoryName: "Groceries", total: 300 }
      // Dining absent this month
    ]
  },
  net: 1500,
  savingsRate: 0.5
});

// ---------------------------------------------------------------------------
// formatMonthShort
// ---------------------------------------------------------------------------

describe("formatMonthShort", () => {
  it("formats YYYY-MM to abbreviated month name", () => {
    expect(formatMonthShort("2025-01")).toBe("Jan");
  });

  it("handles different months correctly", () => {
    expect(formatMonthShort("2025-12")).toBe("Dec");
    expect(formatMonthShort("2025-06")).toBe("Jun");
  });
});

// ---------------------------------------------------------------------------
// collectCategoryRows
// ---------------------------------------------------------------------------

describe("collectCategoryRows", () => {
  it("returns one entry per unique category in a section", () => {
    const rows = collectCategoryRows([JAN], "income");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ categoryId: 1, categoryName: "Salary" });
  });

  it("unions categories across months — category present in Jan only still appears", () => {
    const rows = collectCategoryRows([JAN, FEB], "variable");
    const ids = rows.map((r) => r.categoryId).sort();
    expect(ids).toEqual([3, 4]); // Dining (4) only in Jan, still returned
  });

  it("preserves category name from first month seen", () => {
    const rows = collectCategoryRows([JAN, FEB], "fixed");
    expect(rows[0]).toEqual({ categoryId: 2, categoryName: "Rent" });
  });

  it("returns empty array when a section has no items in any month", () => {
    const emptyMonth = makeMonth("2025-03"); // income.items is []
    const rows = collectCategoryRows([emptyMonth], "income");
    expect(rows).toHaveLength(0);
  });

  it("returns empty array when months array is empty", () => {
    expect(collectCategoryRows([], "income")).toHaveLength(0);
  });

  it("does not duplicate a category that appears in multiple months", () => {
    const rows = collectCategoryRows([JAN, FEB], "income");
    expect(rows).toHaveLength(1); // Salary in both months → only one entry
  });
});

// ---------------------------------------------------------------------------
// getCategoryMonthTotal
// ---------------------------------------------------------------------------

describe("getCategoryMonthTotal", () => {
  it("returns the total for a category in a specific month", () => {
    expect(getCategoryMonthTotal([JAN, FEB], "income", 1, "2025-01")).toBe(3000);
  });

  it("returns 0 when a category has no transactions that month", () => {
    // Dining (4) is absent in FEB
    expect(getCategoryMonthTotal([JAN, FEB], "variable", 4, "2025-02")).toBe(0);
  });

  it("returns 0 for a month not present in the data", () => {
    expect(getCategoryMonthTotal([JAN, FEB], "income", 1, "2025-03")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getCategoryYtd
// ---------------------------------------------------------------------------

describe("getCategoryYtd", () => {
  it("sums a category total across all visible months", () => {
    // Groceries: 250 (Jan) + 300 (Feb) = 550
    expect(getCategoryYtd([JAN, FEB], "variable", 3)).toBe(550);
  });

  it("counts only months where the category appears (missing months contribute 0)", () => {
    // Dining: 150 (Jan) + 0 (Feb, absent) = 150
    expect(getCategoryYtd([JAN, FEB], "variable", 4)).toBe(150);
  });

  it("returns 0 for a category not present in any month", () => {
    expect(getCategoryYtd([JAN, FEB], "variable", 99)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// savingsRateClass
// ---------------------------------------------------------------------------

describe("savingsRateClass", () => {
  it("returns muted class for null rate (no income)", () => {
    expect(savingsRateClass(null)).toContain("muted");
  });

  it("returns destructive class for rate below 10%", () => {
    expect(savingsRateClass(0.05)).toContain("destructive");
    expect(savingsRateClass(0)).toContain("destructive");
  });

  it("returns amber class for rate between 10% and 20% (exclusive)", () => {
    expect(savingsRateClass(0.1)).toContain("amber");
    expect(savingsRateClass(0.15)).toContain("amber");
    expect(savingsRateClass(0.199)).toContain("amber");
  });

  it("returns income (green) class for rate 20% or above", () => {
    expect(savingsRateClass(0.2)).toContain("income");
    expect(savingsRateClass(0.5)).toContain("income");
  });
});
