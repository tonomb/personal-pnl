import { eq, inArray } from "drizzle-orm";

import { buildCardOptimizationResult } from "@pnl/engine";
import { accounts, cardBenefits } from "@pnl/types";

import { fetchRollup } from "./rollup";

import type { CardOptimizationBenefit } from "@pnl/engine";
import type { CardOptimizationResult } from "@pnl/types";
import type { PnlDb } from "./client";

export async function analyzeCardOptimization(
  db: PnlDb,
  startMonth: string,
  endMonth: string
): Promise<CardOptimizationResult> {
  const { currency, cells } = await fetchRollup(db, { startMonth, endMonth });

  const benefitRows = await db
    .select({
      accountId: cardBenefits.accountId,
      accountName: accounts.name,
      categoryGroup: cardBenefits.categoryGroup,
      rewardType: cardBenefits.rewardType,
      rewardRate: cardBenefits.rewardRate
    })
    .from(cardBenefits)
    .innerJoin(accounts, eq(cardBenefits.accountId, accounts.id))
    .where(inArray(cardBenefits.categoryGroup, ["FIXED", "VARIABLE"]));

  const benefits: CardOptimizationBenefit[] = benefitRows.map((r) => ({
    accountId: r.accountId,
    accountName: r.accountName,
    categoryGroup: r.categoryGroup as CardOptimizationBenefit["categoryGroup"],
    rewardType: r.rewardType as CardOptimizationBenefit["rewardType"],
    rewardRate: Number(r.rewardRate ?? 0)
  }));

  return buildCardOptimizationResult(startMonth, endMonth, cells, benefits, currency);
}
