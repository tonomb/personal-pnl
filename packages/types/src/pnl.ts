import Decimal from "decimal.js";
import { eq, sql } from "drizzle-orm";

import { add, divide, safeDivide, subtract, toStorable } from "@pnl/money";

import { categories, transactions } from "./schema";

import type { drizzle } from "drizzle-orm/d1";
import type * as schema from "./schema";
import type { CategoryTotal, KpiSummary, MonthlyPnL, PnLReport } from "./trpc";

export type PnlDb = ReturnType<typeof drizzle<typeof schema>>;

// ---------------------------------------------------------------------------
// Card optimization (LAG-33) response types
// ---------------------------------------------------------------------------

export type CardOptimizationCategoryGroup = "FIXED" | "VARIABLE";
export type CardOptimizationRewardType = "CASHBACK" | "POINTS";

export type CardOptimizationAccountSpend = {
  account_id: string;
  account_name: string;
  spend: number;
  reward_rate: number;
  reward_type: CardOptimizationRewardType | null;
  rewards_earned: number;
};

export type CardOptimizationCategoryRow = {
  category_group: CardOptimizationCategoryGroup;
  total_spend: number;
  by_account: CardOptimizationAccountSpend[];
  best_rate: number;
  best_rate_account_id: string | null;
  best_rate_account_name: string | null;
  best_reward_type: CardOptimizationRewardType | null;
  rewards_earned: number;
  rewards_potential: number;
  missed_rewards: number;
};

export type CardOptimizationRewardTotals = {
  earned: number;
  potential: number;
  missed: number;
};

export type CardOptimizationSummary = {
  cashback: CardOptimizationRewardTotals;
  points: CardOptimizationRewardTotals;
};

export type CardOptimizationResult = {
  start_month: string;
  end_month: string;
  category_groups: CardOptimizationCategoryRow[];
  summary: CardOptimizationSummary;
};

export type PnlRow = {
  month: string;
  categoryId: number | null;
  categoryName: string | null;
  groupType: string | null;
  creditTotal: number;
  debitTotal: number;
  rowCount?: number;
};

export function buildMonthlyPnL(month: string, rows: PnlRow[]): MonthlyPnL {
  const monthRows = rows.filter((r) => r.month === month);

  const incomeItems: CategoryTotal[] = [];
  const fixedItems: CategoryTotal[] = [];
  const variableItems: CategoryTotal[] = [];
  const ignoredItems: CategoryTotal[] = [];

  for (const row of monthRows) {
    if (row.categoryId === null) continue;
    const ct: CategoryTotal = { categoryId: row.categoryId, categoryName: row.categoryName ?? "", total: 0 };
    if (row.groupType === "INCOME") {
      ct.total = toStorable(new Decimal(row.creditTotal));
      incomeItems.push(ct);
    } else if (row.groupType === "FIXED") {
      ct.total = toStorable(new Decimal(row.debitTotal));
      fixedItems.push(ct);
    } else if (row.groupType === "VARIABLE") {
      ct.total = toStorable(new Decimal(row.debitTotal));
      variableItems.push(ct);
    } else if (row.groupType === "IGNORED") {
      ct.total = toStorable(add(row.creditTotal, row.debitTotal));
      ignoredItems.push(ct);
    }
  }

  const incomeD = incomeItems.reduce((s, c) => add(s, c.total), new Decimal(0));
  const fixedD = fixedItems.reduce((s, c) => add(s, c.total), new Decimal(0));
  const variableD = variableItems.reduce((s, c) => add(s, c.total), new Decimal(0));
  const netD = subtract(subtract(incomeD, fixedD), variableD);
  const savingsRateD = safeDivide(netD, incomeD);
  const ignoredD = ignoredItems.reduce((s, c) => add(s, c.total), new Decimal(0));

  return {
    month,
    income: { total: toStorable(incomeD), items: incomeItems },
    fixed: { total: toStorable(fixedD), items: fixedItems },
    variable: { total: toStorable(variableD), items: variableItems },
    ignored: { total: toStorable(ignoredD), items: ignoredItems },
    net: toStorable(netD),
    savingsRate: savingsRateD === null ? null : toStorable(savingsRateD)
  };
}

export function getSavingsRateBenchmark(rate: number | null): KpiSummary["savingsLabel"] {
  if (rate === null) return null;
  if (rate >= 0.2) return "HEALTHY";
  if (rate >= 0.1) return "WATCH";
  return "DANGER";
}

export async function computePnlReport(db: PnlDb, year: number): Promise<PnLReport> {
  const yearStr = String(year);

  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      creditTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'CREDIT' THEN ${transactions.amount} ELSE 0 END)`,
      debitTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`,
      rowCount: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(sql`strftime('%Y', ${transactions.date}) = ${yearStr}`)
    .groupBy(sql`strftime('%Y-%m', ${transactions.date})`, transactions.categoryId)
    .orderBy(sql`strftime('%Y-%m', ${transactions.date})`);

  const months = [...new Set(rows.map((r) => r.month))];
  const monthlyData = months.map((m) => buildMonthlyPnL(m, rows));

  const uncategorizedCount = rows.filter((r) => r.categoryId === null).reduce((s, r) => s + (r.rowCount ?? 0), 0);

  const ytdIncomeD = monthlyData.reduce((s, m) => add(s, m.income.total), new Decimal(0));
  const ytdExpensesD = monthlyData.reduce((s, m) => add(add(s, m.fixed.total), m.variable.total), new Decimal(0));
  const ytdNetD = subtract(ytdIncomeD, ytdExpensesD);

  const nonNullRates = monthlyData.map((m) => m.savingsRate).filter((r): r is number => r !== null);
  const avgMonthlySavingsRate =
    nonNullRates.length === 0
      ? null
      : toStorable(
          divide(
            nonNullRates.reduce((s, r) => add(s, r), new Decimal(0)),
            nonNullRates.length
          )
        );

  return {
    months: monthlyData,
    ytdIncome: toStorable(ytdIncomeD),
    ytdExpenses: toStorable(ytdExpensesD),
    ytdNet: toStorable(ytdNetD),
    avgMonthlySavingsRate,
    uncategorizedCount
  };
}

export async function computeMonthlyPnl(
  db: PnlDb,
  month: string
): Promise<{ pnl: MonthlyPnL; uncategorizedCount: number }> {
  const rows = await db
    .select({
      month: sql<string>`strftime('%Y-%m', ${transactions.date})`,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      groupType: categories.groupType,
      creditTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'CREDIT' THEN ${transactions.amount} ELSE 0 END)`,
      debitTotal: sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`,
      rowCount: sql<number>`COUNT(*)`
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(sql`strftime('%Y-%m', ${transactions.date}) = ${month}`)
    .groupBy(sql`strftime('%Y-%m', ${transactions.date})`, transactions.categoryId);

  const pnl = buildMonthlyPnL(month, rows);
  const uncategorizedCount = rows.filter((r) => r.categoryId === null).reduce((s, r) => s + (r.rowCount ?? 0), 0);

  return { pnl, uncategorizedCount };
}
