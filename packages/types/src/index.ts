export * from "./schema";
export { buildMonthlyPnL, computeMonthlyPnl, computePnlReport, getSavingsRateBenchmark } from "./pnl";
export type {
  CardOptimizationAccountSpend,
  CardOptimizationCategoryGroup,
  CardOptimizationCategoryRow,
  CardOptimizationResult,
  CardOptimizationRewardType,
  CardOptimizationRewardTotals,
  CardOptimizationSummary,
  PnlDb,
  PnlRow
} from "./pnl";
export { analyzeCardOptimization, buildCardOptimizationResult } from "./card-optimization";
export type { CardOptimizationBenefitInput, CardOptimizationSpendInput } from "./card-optimization";
export { getSpendingByCategory, getTopMerchants, listTransactions, searchTransactions } from "./transactions-query";
export type {
  ListTransactionsInput,
  ListTransactionsResult,
  SearchTransactionsInput,
  SpendingByCategoryRow,
  TopMerchantRow,
  TopMerchantsInput,
  TransactionRow
} from "./transactions-query";
export { getBudgetVariance, getCashflowTrend, getCategoryList, getFinancialHealthSnapshot } from "./advisor-tools";
export { getTagReportByName, listTagNames } from "./tags";
export type { TagReportByNameResult } from "./tags";
export type {
  BudgetVarianceLabel,
  BudgetVarianceResult,
  BudgetVarianceRow,
  CashflowTrendPoint,
  CashflowTrendResult,
  CategoryListResult,
  CategoryListRow,
  DataQuality,
  FinancialHealthSnapshot
} from "./advisor-tools";
export type {
  AccountWithBenefits,
  AppRouter,
  UpsertCardBenefitInput,
  CategoryTotal,
  GroupedTransaction,
  KpiSummary,
  MonthGroup,
  MonthlyPnL,
  PnLReport,
  TagReport,
  TagReportCategoryBreakdown,
  TagReportTransaction,
  TagWithCount,
  TransactionListFilter,
  TransactionListInput,
  TransactionListResult,
  TransactionWithCategory
} from "./trpc";
