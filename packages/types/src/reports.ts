import type { KpiSummary, TagReport } from "./trpc";

// ---------------------------------------------------------------------------
// Report/DTO types for advisor tools, card optimization, and transaction
// queries. Money fields are major units in the report's `currency`
// (the base currency, ADR-0003) unless the row carries its own currency.
// ---------------------------------------------------------------------------

export type DataQuality = {
  uncategorized_count: number;
  uncategorized_pct: number;
  warning: boolean;
};

// --- Advisor tools ---------------------------------------------------------

export type FinancialHealthSnapshot = {
  month: string;
  currency: string;
  net: number;
  netLabel: KpiSummary["netLabel"];
  savingsRate: number | null;
  savingsLabel: KpiSummary["savingsLabel"];
  biggestExpense: { name: string; total: number } | null;
  vsLastMonth: { delta: number; label: "BETTER" | "WORSE" | "SAME" } | null;
  data_quality: DataQuality;
};

export type BudgetVarianceLabel = "OVER" | "UNDER" | "ON_TRACK";

export type BudgetVarianceRow = {
  categoryId: number;
  categoryName: string;
  groupType: "FIXED" | "VARIABLE";
  trailingAvg: number;
  actual: number;
  variance: number;
  status: BudgetVarianceLabel;
};

export type BudgetVarianceResult = {
  month: string;
  currency: string;
  trailingMonths: string[];
  rows: BudgetVarianceRow[];
  data_quality: DataQuality;
};

export type CashflowTrendPoint = {
  month: string;
  income: number;
  expenses: number;
  net: number;
};

export type CashflowTrendResult = {
  currency: string;
  months: CashflowTrendPoint[];
  data_quality: DataQuality;
};

export type CategoryListRow = {
  id: number;
  name: string;
  group_type: "INCOME" | "FIXED" | "VARIABLE" | "IGNORED";
  color: string | null;
};

export type CategoryListResult = {
  rows: CategoryListRow[];
  data_quality: DataQuality;
};

// --- Card optimization (LAG-33) ---------------------------------------------

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
  currency: string;
  category_groups: CardOptimizationCategoryRow[];
  summary: CardOptimizationSummary;
};

// --- Transaction queries (MCP tools) ----------------------------------------

/** Raw transaction row in its account's original currency (unconverted). */
export type TransactionRow = {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "DEBIT" | "CREDIT";
  categoryId: number | null;
  categoryName: string | null;
};

export type ListTransactionsInput = {
  month?: string;
  categoryId?: number;
  uncategorized?: boolean;
  limit?: number;
  offset?: number;
};

export type ListTransactionsResult = {
  rows: TransactionRow[];
  total: number;
};

export type SpendingByCategoryRow = {
  categoryId: number;
  categoryName: string;
  groupType: "FIXED" | "VARIABLE";
  total: number;
};

export type SpendingByCategoryResult = {
  currency: string;
  rows: SpendingByCategoryRow[];
};

export type TopMerchantsInput = {
  month?: string;
  limit?: number;
};

export type TopMerchantRow = {
  merchant: string;
  count: number;
  total: number;
};

export type TopMerchantsResult = {
  currency: string;
  rows: TopMerchantRow[];
};

export type SearchTransactionsInput = {
  query: string;
  month?: string;
  limit?: number;
};

// --- Tag reports -------------------------------------------------------------

export type TagReportByNameResult = {
  report: TagReport;
  availableTags: string[];
};
