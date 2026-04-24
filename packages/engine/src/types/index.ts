import type { Decimal } from "decimal.js";
import type { Category, Transaction } from "@pnl/types";

export interface PnlInput {
  transactions: Transaction[];
  categories: Category[];
}

export interface PnlResult {
  totalIncome: Decimal;
  totalFixedExpenses: Decimal;
  totalVariableExpenses: Decimal;
  totalExpenses: Decimal;
  netIncome: Decimal;
  savingsRate: Decimal | null;
}
