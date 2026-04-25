import { eq, sql } from "drizzle-orm";

import { categories, transactions } from "./schema";

import type { drizzle } from "drizzle-orm/d1";
import type * as schema from "./schema";
import type { CategoryTotal, KpiSummary, MonthlyPnL, PnLReport } from "./trpc";

export type PnlDb = ReturnType<typeof drizzle<typeof schema>>;

export type PnlRow = {
  month: string;
  categoryId: number | null;
  categoryName: string | null;
  groupType: string | null;
  creditTotal: number;
  debitTotal: number;
  rowCount?: number;
};

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

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
      ct.total = round2(row.creditTotal);
      incomeItems.push(ct);
    } else if (row.groupType === "FIXED") {
      ct.total = round2(row.debitTotal);
      fixedItems.push(ct);
    } else if (row.groupType === "VARIABLE") {
      ct.total = round2(row.debitTotal);
      variableItems.push(ct);
    } else if (row.groupType === "IGNORED") {
      ct.total = round2(row.creditTotal + row.debitTotal);
      ignoredItems.push(ct);
    }
  }

  const income = round2(incomeItems.reduce((s, c) => s + c.total, 0));
  const fixed = round2(fixedItems.reduce((s, c) => s + c.total, 0));
  const variable = round2(variableItems.reduce((s, c) => s + c.total, 0));
  const net = round2(income - fixed - variable);
  const savingsRate = income === 0 ? null : round2(net / income);

  return {
    month,
    income: { total: income, items: incomeItems },
    fixed: { total: fixed, items: fixedItems },
    variable: { total: variable, items: variableItems },
    ignored: { total: round2(ignoredItems.reduce((s, c) => s + c.total, 0)), items: ignoredItems },
    net,
    savingsRate
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

  const ytdIncome = round2(monthlyData.reduce((s, m) => s + m.income.total, 0));
  const ytdExpenses = round2(monthlyData.reduce((s, m) => s + m.fixed.total + m.variable.total, 0));
  const ytdNet = round2(ytdIncome - ytdExpenses);

  const nonNullRates = monthlyData.map((m) => m.savingsRate).filter((r): r is number => r !== null);
  const avgMonthlySavingsRate =
    nonNullRates.length === 0 ? null : round2(nonNullRates.reduce((s, r) => s + r, 0) / nonNullRates.length);

  return { months: monthlyData, ytdIncome, ytdExpenses, ytdNet, avgMonthlySavingsRate, uncategorizedCount };
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
