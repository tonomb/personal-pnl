import { describe, expect, it } from "vitest";

import { buildKpiSummary } from "./kpi";

import type { RollupCell } from "./rollup-cell";

const cell = (over: Partial<RollupCell>): RollupCell => ({
  month: "2026-02",
  categoryId: 1,
  categoryName: "Salary",
  groupType: "INCOME",
  accountId: "acc-1",
  accountName: "Account 1",
  cents: 0,
  rowCount: 1,
  ...over
});

describe("buildKpiSummary", () => {
  it("labels positive net IN_THE_GREEN and picks the biggest expense", () => {
    const cells = [
      cell({ cents: 300000 }),
      cell({ categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 120000 }),
      cell({ categoryId: 21, categoryName: "Dining", groupType: "VARIABLE", cents: 40000 })
    ];
    const kpi = buildKpiSummary("2026-02", "2026-01", cells, "MXN");
    expect(kpi.net).toBe(1400);
    expect(kpi.netLabel).toBe("IN_THE_GREEN");
    expect(kpi.biggestExpense).toEqual({ name: "Rent", total: 1200 });
    expect(kpi.currency).toBe("MXN");
  });

  it("returns null vsLastMonth when the previous month has no categorized data", () => {
    const cells = [cell({ cents: 100000 })];
    const kpi = buildKpiSummary("2026-02", "2026-01", cells, "MXN");
    expect(kpi.vsLastMonth).toBeNull();
  });

  it("computes the vsLastMonth delta from both months' nets", () => {
    const cells = [
      cell({ month: "2026-02", cents: 300000 }),
      cell({ month: "2026-01", cents: 250000 }),
      cell({ month: "2026-01", categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 100000 })
    ];
    const kpi = buildKpiSummary("2026-02", "2026-01", cells, "MXN");
    // curr net 3000, prev net 1500
    expect(kpi.vsLastMonth).toEqual({ delta: 1500, label: "BETTER" });
  });

  it("labels zero net NEUTRAL and negative net IN_THE_RED", () => {
    expect(buildKpiSummary("2026-02", "2026-01", [], "MXN").netLabel).toBe("NEUTRAL");
    const red = buildKpiSummary(
      "2026-02",
      "2026-01",
      [cell({ categoryId: 10, categoryName: "Rent", groupType: "FIXED", cents: 50000 })],
      "MXN"
    );
    expect(red.netLabel).toBe("IN_THE_RED");
  });
});
