import { describe, expect, it } from "vitest";

import { buildPnlReport, buildPnlReportCsv, sumCategoryAcrossMonths } from "./report";
import { summarizeTagRows } from "./tag-report";

import type { RollupCell } from "./rollup-cell";
import type { TagReportRow } from "./tag-report";

const cell = (over: Partial<RollupCell>): RollupCell => ({
  month: "2026-01",
  categoryId: 1,
  categoryName: "Salary",
  groupType: "INCOME",
  accountId: "acc-1",
  accountName: "Account 1",
  cents: 0,
  rowCount: 1,
  ...over
});

describe("buildPnlReport", () => {
  it("aggregates YTD totals exactly and counts uncategorized rows", () => {
    const cells = [
      cell({ month: "2026-01", cents: 100010 }),
      cell({ month: "2026-02", cents: 100010 }),
      cell({ month: "2026-02", categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 50000 }),
      cell({ month: "2026-02", categoryId: null, categoryName: null, groupType: null, cents: 1234, rowCount: 3 })
    ];
    const report = buildPnlReport(cells, "MXN");
    expect(report.months.map((m) => m.month)).toEqual(["2026-01", "2026-02"]);
    expect(report.ytdIncome).toBe(2000.2);
    expect(report.ytdExpenses).toBe(500);
    expect(report.ytdNet).toBe(1500.2);
    expect(report.uncategorizedCount).toBe(3);
    expect(report.currency).toBe("MXN");
  });

  it("averages monthly savings rates at 4dp", () => {
    const cells = [
      cell({ month: "2026-01", cents: 200000 }),
      cell({ month: "2026-01", categoryId: 10, groupType: "FIXED", cents: 48700 }), // rate 0.7565
      cell({ month: "2026-02", cents: 200000 }),
      cell({ month: "2026-02", categoryId: 10, groupType: "FIXED", cents: 100000 }) // rate 0.5
    ];
    const report = buildPnlReport(cells, "MXN");
    expect(report.avgMonthlySavingsRate).toBe(0.6283);
  });
});

describe("buildPnlReportCsv", () => {
  it("sums the YTD column in cents so line items reconcile", () => {
    const cells = [
      cell({ month: "2026-01", categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", cents: 10 }),
      cell({ month: "2026-02", categoryId: 20, categoryName: "Groceries", groupType: "VARIABLE", cents: 20 })
    ];
    const report = buildPnlReport(cells, "MXN");
    expect(sumCategoryAcrossMonths(report.months, "variable", 20)).toBe(0.3);

    const csv = buildPnlReportCsv(report.months, ["Jan", "Feb"]);
    const groceriesLine = csv.split("\n").find((l) => l.startsWith("Groceries"))!;
    expect(groceriesLine).toBe("Groceries,0.10,0.20,0.30");
  });

  it("escapes category names containing commas", () => {
    const cells = [
      cell({ month: "2026-01", categoryId: 20, categoryName: "Food, Drink", groupType: "VARIABLE", cents: 100 })
    ];
    const report = buildPnlReport(cells, "MXN");
    const csv = buildPnlReportCsv(report.months, ["Jan"]);
    expect(csv).toContain('"Food, Drink"');
  });
});

describe("summarizeTagRows", () => {
  const row = (over: Partial<TagReportRow>): TagReportRow => ({
    date: "2026-01-15",
    cents: 0,
    categoryId: 20,
    categoryName: "Groceries",
    groupType: "VARIABLE",
    ...over
  });

  it("derives totals from the category group, not bank type (D8 / ADR-0002)", () => {
    const rows = [
      row({ cents: 30000 }),
      row({ categoryId: 1, categoryName: "Salary", groupType: "INCOME", cents: 100000 }),
      // A refund categorized as income reduces the tag's net spend.
      row({ categoryId: 7, categoryName: "Refunds", groupType: "INCOME", cents: 5000 })
    ];
    const summary = summarizeTagRows(rows);
    expect(summary.totalSpend).toBe(300);
    expect(summary.totalIncome).toBe(1050);
    expect(summary.net).toBe(750);
    expect(summary.byCategory).toHaveLength(3);
  });

  it("keeps uncategorized rows out of totals but inside the date range", () => {
    const rows = [
      row({ date: "2026-01-01", categoryId: null, categoryName: null, groupType: null, cents: 99900 }),
      row({ date: "2026-03-31", cents: 10000 })
    ];
    const summary = summarizeTagRows(rows);
    expect(summary.totalSpend).toBe(100);
    expect(summary.dateRange).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });

  it("returns a null date range for no rows", () => {
    expect(summarizeTagRows([]).dateRange).toBeNull();
  });
});
