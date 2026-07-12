import { centsToAmount } from "@pnl/money";

import type { TagReportCategoryBreakdown } from "@pnl/types";

/** One tagged transaction, with its magnitude already converted to base cents. */
export type TagReportRow = {
  date: string;
  cents: number;
  categoryId: number | null;
  categoryName: string | null;
  groupType: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED" | null;
};

export type TagReportSummary = {
  totalIncome: number;
  totalSpend: number;
  net: number;
  byCategory: TagReportCategoryBreakdown[];
  dateRange: { from: string; to: string } | null;
};

/**
 * Totals follow the direction-from-category rule (ADR-0002): income is the
 * sum of INCOME-category rows, spend the sum of FIXED/VARIABLE rows — bank
 * type is ignored. Uncategorized and IGNORED rows count toward neither total
 * but still bound the date range.
 */
export function summarizeTagRows(rows: TagReportRow[]): TagReportSummary {
  type CategoryBucket = {
    categoryId: number;
    categoryName: string;
    groupType: "INCOME" | "FIXED" | "VARIABLE";
    cents: number;
  };
  const byCatMap = new Map<number, CategoryBucket>();
  let incomeCents = 0;
  let spendCents = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const row of rows) {
    if (minDate === null || row.date < minDate) minDate = row.date;
    if (maxDate === null || row.date > maxDate) maxDate = row.date;

    const groupType = row.groupType;
    if (groupType !== "INCOME" && groupType !== "FIXED" && groupType !== "VARIABLE") continue;
    if (row.categoryId === null || row.categoryName === null) continue;

    if (groupType === "INCOME") {
      incomeCents += row.cents;
    } else {
      spendCents += row.cents;
    }

    const existing = byCatMap.get(row.categoryId);
    if (existing) {
      existing.cents += row.cents;
    } else {
      byCatMap.set(row.categoryId, {
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        groupType,
        cents: row.cents
      });
    }
  }

  const byCategory: TagReportCategoryBreakdown[] = [...byCatMap.values()].map(({ cents, ...rest }) => ({
    ...rest,
    total: centsToAmount(cents)
  }));

  return {
    totalIncome: centsToAmount(incomeCents),
    totalSpend: centsToAmount(spendCents),
    net: centsToAmount(incomeCents - spendCents),
    byCategory,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null
  };
}
