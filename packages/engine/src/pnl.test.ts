import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import type { PnlInput } from "./types";
import { computePnl } from "./pnl";

const makeCategory = (id: number, groupType: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED") => ({
  id,
  name: `Category ${id}`,
  groupType,
  isDefault: false,
  color: null,
  sortOrder: 0
});

const makeTx = (id: string, amount: number, type: "CREDIT" | "DEBIT", categoryId: number | null = null) => ({
  id,
  date: "2024-01-15",
  description: "Test transaction",
  amount,
  type,
  accountId: "test-account",
  categoryId,
  sourceFile: null,
  rawRow: null,
  createdAt: new Date().toISOString()
});

describe("computePnl", () => {
  it("sums income from CREDIT transactions in INCOME categories", () => {
    const input: PnlInput = {
      categories: [makeCategory(1, "INCOME")],
      transactions: [makeTx("t1", 1000, "CREDIT", 1), makeTx("t2", 500, "CREDIT", 1)]
    };
    const result = computePnl(input);
    expect(result.totalIncome.equals(new Decimal("1500"))).toBe(true);
  });

  it("sums fixed expenses from DEBIT transactions in FIXED categories", () => {
    const input: PnlInput = {
      categories: [makeCategory(2, "FIXED")],
      transactions: [makeTx("t1", 800, "DEBIT", 2)]
    };
    const result = computePnl(input);
    expect(result.totalFixedExpenses.equals(new Decimal("800"))).toBe(true);
  });

  it("sums variable expenses from DEBIT transactions in VARIABLE categories", () => {
    const input: PnlInput = {
      categories: [makeCategory(3, "VARIABLE")],
      transactions: [makeTx("t1", 300, "DEBIT", 3)]
    };
    const result = computePnl(input);
    expect(result.totalVariableExpenses.equals(new Decimal("300"))).toBe(true);
  });

  it("computes totalExpenses as fixed + variable", () => {
    const input: PnlInput = {
      categories: [makeCategory(2, "FIXED"), makeCategory(3, "VARIABLE")],
      transactions: [makeTx("t1", 800, "DEBIT", 2), makeTx("t2", 300, "DEBIT", 3)]
    };
    const result = computePnl(input);
    expect(result.totalExpenses.equals(new Decimal("1100"))).toBe(true);
  });

  it("computes netIncome as income minus totalExpenses", () => {
    const input: PnlInput = {
      categories: [makeCategory(1, "INCOME"), makeCategory(2, "FIXED")],
      transactions: [makeTx("t1", 2000, "CREDIT", 1), makeTx("t2", 800, "DEBIT", 2)]
    };
    const result = computePnl(input);
    expect(result.netIncome.equals(new Decimal("1200"))).toBe(true);
  });

  it("computes savingsRate as netIncome / totalIncome", () => {
    const input: PnlInput = {
      categories: [makeCategory(1, "INCOME"), makeCategory(2, "FIXED")],
      transactions: [makeTx("t1", 2000, "CREDIT", 1), makeTx("t2", 500, "DEBIT", 2)]
    };
    const result = computePnl(input);
    // (2000 - 500) / 2000 = 0.75
    expect(result.savingsRate?.equals(new Decimal("0.75"))).toBe(true);
  });

  it("returns null savingsRate when income is zero", () => {
    const input: PnlInput = {
      categories: [makeCategory(2, "FIXED")],
      transactions: [makeTx("t1", 500, "DEBIT", 2)]
    };
    const result = computePnl(input);
    expect(result.savingsRate).toBeNull();
  });

  it("excludes IGNORED category transactions from all totals", () => {
    const input: PnlInput = {
      categories: [makeCategory(4, "IGNORED")],
      transactions: [makeTx("t1", 9999, "DEBIT", 4)]
    };
    const result = computePnl(input);
    expect(result.totalExpenses.equals(new Decimal("0"))).toBe(true);
    expect(result.totalIncome.equals(new Decimal("0"))).toBe(true);
  });

  it("excludes uncategorized transactions from all totals", () => {
    const input: PnlInput = {
      categories: [],
      transactions: [makeTx("t1", 9999, "DEBIT", null)]
    };
    const result = computePnl(input);
    expect(result.totalExpenses.equals(new Decimal("0"))).toBe(true);
  });
});
