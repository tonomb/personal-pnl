import { centsToAmount, toCents } from "@pnl/money";

import { buildMonthlyPnL, getSavingsRateBenchmark } from "./monthly-pnl";

import type { KpiSummary } from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

/**
 * The single implementation of KPI derivation, shared by the tRPC
 * `pnl.getKpis` procedure and the MCP financial-health snapshot.
 * `cells` must cover both `month` and `prevMonth`.
 */
export function buildKpiSummary(month: string, prevMonth: string, cells: RollupCell[], currency: string): KpiSummary {
  const curr = buildMonthlyPnL(month, cells, currency);

  const netLabel: KpiSummary["netLabel"] = curr.net > 0 ? "IN_THE_GREEN" : curr.net < 0 ? "IN_THE_RED" : "NEUTRAL";
  const savingsLabel = getSavingsRateBenchmark(curr.savingsRate);

  const expenseItems = [...curr.fixed.items, ...curr.variable.items];
  const biggestExpense =
    expenseItems.length === 0 ? null : expenseItems.reduce((max, item) => (item.total > max.total ? item : max));

  const hasPrevData = cells.some((c) => c.month === prevMonth && c.categoryId !== null);
  const vsLastMonth: KpiSummary["vsLastMonth"] = (() => {
    if (!hasPrevData) return null;
    const prev = buildMonthlyPnL(prevMonth, cells, currency);
    const delta = centsToAmount(toCents(curr.net) - toCents(prev.net));
    const label: "BETTER" | "WORSE" | "SAME" = delta > 0 ? "BETTER" : delta < 0 ? "WORSE" : "SAME";
    return { delta, label };
  })();

  return {
    month,
    currency,
    net: curr.net,
    netLabel,
    savingsRate: curr.savingsRate,
    savingsLabel,
    biggestExpense: biggestExpense ? { name: biggestExpense.categoryName, total: biggestExpense.total } : null,
    vsLastMonth
  };
}
