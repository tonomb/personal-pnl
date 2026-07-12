import type { Account, CardBenefit, Category, Tag } from "./schema";

// ---------------------------------------------------------------------------
// API/DTO types shared between the worker and the web app.
//
// Money fields are ALWAYS major units (≤2dp numbers) — cents never cross the
// API (ADR-0001). Aggregate DTOs carry the currency they are denominated in
// (the user's base currency, ADR-0003); raw transaction rows carry their
// account's original currency.
//
// The `AppRouter` type is exported by the worker (`pnl-api/router`) and
// derived from the real router — there is deliberately no hand-mirrored
// router here.
// ---------------------------------------------------------------------------

export type UpsertCardBenefitInput = {
  accountId: string;
  categoryGroup: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";
  rewardType: "CASHBACK" | "POINTS";
  rewardRate: number;
  notes?: string | null;
};

export type AccountWithBenefits = Account & { benefits: CardBenefit[] };

/** A transaction row as the API returns it: amount in major units of `currency`. */
export type TransactionWithCategory = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "DEBIT" | "CREDIT";
  categoryId: number | null;
  sourceFile: string | null;
  createdAt: string;
  categoryName: string | null;
  categoryGroupType: string | null;
  categoryColor: string | null;
  tags: Tag[];
};

export type TagWithCount = Tag & { transactionCount: number };

export type TagReportCategoryBreakdown = {
  categoryId: number;
  categoryName: string;
  groupType: "INCOME" | "FIXED" | "VARIABLE";
  total: number;
};

export type TagReportTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "DEBIT" | "CREDIT";
  categoryId: number | null;
  accountId: string;
  sourceFile: string | null;
  rawRow: string | null;
  createdAt: string;
  tags: Tag[];
};

export type TagReport = {
  tag: Tag;
  currency: string;
  totalIncome: number;
  totalSpend: number;
  net: number;
  byCategory: TagReportCategoryBreakdown[];
  transactions: TagReportTransaction[];
  dateRange: { from: string; to: string } | null;
};

export type GroupedTransaction = {
  description: string;
  count: number;
  totalAmount: number;
  categoryId: number | null;
  categoryName: string | null;
  categoryGroupType: string | null;
  categoryColor: string | null;
};

export type GroupedTransactionsResult = {
  currency: string;
  rows: GroupedTransaction[];
};

export type TransactionListFilter = {
  month?: string;
  categoryId?: number;
  uncategorized?: boolean;
};

export type TransactionListInput = TransactionListFilter & {
  limit?: number;
  offset?: number;
};

export type TransactionListResult = {
  rows: TransactionWithCategory[];
  total: number;
};

export type CategoryTotal = {
  categoryId: number;
  categoryName: string;
  total: number;
};

export type MonthGroup = {
  total: number;
  items: CategoryTotal[];
};

export type MonthlyPnL = {
  month: string;
  currency: string;
  income: MonthGroup;
  fixed: MonthGroup;
  variable: MonthGroup;
  ignored: MonthGroup;
  net: number;
  savingsRate: number | null;
};

export type PnLReport = {
  currency: string;
  months: MonthlyPnL[];
  ytdIncome: number;
  ytdExpenses: number;
  ytdNet: number;
  avgMonthlySavingsRate: number | null;
  uncategorizedCount: number;
};

export type KpiSummary = {
  month: string;
  currency: string;
  net: number;
  netLabel: "IN_THE_GREEN" | "IN_THE_RED" | "NEUTRAL";
  savingsRate: number | null;
  savingsLabel: "HEALTHY" | "WATCH" | "DANGER" | null;
  biggestExpense: { name: string; total: number } | null;
  vsLastMonth: { delta: number; label: "BETTER" | "WORSE" | "SAME" } | null;
};

/** Categories grouped for pickers. */
export type CategoriesByGroup = {
  INCOME: Category[];
  FIXED: Category[];
  VARIABLE: Category[];
  IGNORED: Category[];
};

/** A needed (month, currency) pair with no fx_rates row — reports hard-error on these (ADR-0003). */
export type MissingFxRate = {
  month: string;
  currency: string;
};
