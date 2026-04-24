import Decimal from "decimal.js";
import { add, safeDivide } from "./money";
import type { PnlInput, PnlResult } from "./types";

export function computePnl({ transactions, categories }: PnlInput): PnlResult {
  const groupById = new Map(categories.map((c) => [c.id, c.groupType]));

  let totalIncome = new Decimal(0);
  let totalFixedExpenses = new Decimal(0);
  let totalVariableExpenses = new Decimal(0);

  for (const tx of transactions) {
    if (tx.categoryId === null) continue;
    const group = groupById.get(tx.categoryId);
    if (!group || group === "IGNORED") continue;

    if (group === "INCOME" && tx.type === "CREDIT") {
      totalIncome = add(totalIncome, tx.amount);
    } else if (group === "FIXED" && tx.type === "DEBIT") {
      totalFixedExpenses = add(totalFixedExpenses, tx.amount);
    } else if (group === "VARIABLE" && tx.type === "DEBIT") {
      totalVariableExpenses = add(totalVariableExpenses, tx.amount);
    }
  }

  const totalExpenses = add(totalFixedExpenses, totalVariableExpenses);
  const netIncome = totalIncome.sub(totalExpenses);
  const savingsRate = safeDivide(netIncome, totalIncome);

  return {
    totalIncome,
    totalFixedExpenses,
    totalVariableExpenses,
    totalExpenses,
    netIncome,
    savingsRate
  };
}
