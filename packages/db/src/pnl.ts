import { buildKpiSummary, buildMonthlyPnL, buildPnlReport, countUncategorized, previousMonth } from "@pnl/engine";

import { fetchRollup } from "./rollup";

import type { KpiSummary, MonthlyPnL, PnLReport } from "@pnl/types";
import type { PnlDb } from "./client";

export async function computePnlReport(db: PnlDb, year: number): Promise<PnLReport> {
  const { currency, cells } = await fetchRollup(db, { year });
  return buildPnlReport(cells, currency);
}

export async function computeMonthlyPnl(
  db: PnlDb,
  month: string
): Promise<{ pnl: MonthlyPnL; uncategorizedCount: number }> {
  const { currency, cells } = await fetchRollup(db, { months: [month] });
  return { pnl: buildMonthlyPnL(month, cells, currency), uncategorizedCount: countUncategorized(cells) };
}

export async function computeKpiSummary(db: PnlDb, month: string): Promise<KpiSummary> {
  const prevMonth = previousMonth(month);
  const { currency, cells } = await fetchRollup(db, { months: [month, prevMonth] });
  return buildKpiSummary(month, prevMonth, cells, currency);
}
