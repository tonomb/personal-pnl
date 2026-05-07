import Decimal from "decimal.js";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { add, multiply, subtract, toStorable } from "@pnl/money";

import { accounts, cardBenefits, categories, transactions } from "./schema";

import type {
  CardOptimizationAccountSpend,
  CardOptimizationCategoryGroup,
  CardOptimizationCategoryRow,
  CardOptimizationResult,
  CardOptimizationRewardType,
  CardOptimizationSummary,
  PnlDb
} from "./pnl";

const SPEND_GROUPS: CardOptimizationCategoryGroup[] = ["FIXED", "VARIABLE"];

export type CardOptimizationSpendInput = {
  category_group: CardOptimizationCategoryGroup;
  account_id: string;
  account_name: string;
  spend: number;
};

export type CardOptimizationBenefitInput = {
  account_id: string;
  category_group: CardOptimizationCategoryGroup;
  reward_type: CardOptimizationRewardType;
  reward_rate: number;
};

type BenefitKey = `${string}::${CardOptimizationCategoryGroup}`;

function benefitKey(accountId: string, group: CardOptimizationCategoryGroup): BenefitKey {
  return `${accountId}::${group}`;
}

function emptyTotals() {
  return { earned: new Decimal(0), potential: new Decimal(0), missed: new Decimal(0) };
}

export function buildCardOptimizationResult(
  startMonth: string,
  endMonth: string,
  spendRows: CardOptimizationSpendInput[],
  benefitRows: CardOptimizationBenefitInput[],
  accountNamesById: Map<string, string>
): CardOptimizationResult {
  const benefitsByKey = new Map<BenefitKey, CardOptimizationBenefitInput>();
  const bestByGroup = new Map<
    CardOptimizationCategoryGroup,
    { rate: Decimal; accountId: string; rewardType: CardOptimizationRewardType }
  >();

  for (const b of benefitRows) {
    benefitsByKey.set(benefitKey(b.account_id, b.category_group), b);
    const current = bestByGroup.get(b.category_group);
    const candidate = new Decimal(b.reward_rate);
    if (!current || candidate.gt(current.rate)) {
      bestByGroup.set(b.category_group, {
        rate: candidate,
        accountId: b.account_id,
        rewardType: b.reward_type
      });
    }
  }

  type GroupBucket = {
    totalSpend: Decimal;
    byAccount: Map<string, { spend: Decimal; accountName: string }>;
  };
  const groupBuckets = new Map<CardOptimizationCategoryGroup, GroupBucket>();
  for (const group of SPEND_GROUPS) {
    groupBuckets.set(group, { totalSpend: new Decimal(0), byAccount: new Map() });
  }

  for (const row of spendRows) {
    const bucket = groupBuckets.get(row.category_group);
    if (!bucket) continue;
    const spendD = new Decimal(row.spend);
    bucket.totalSpend = add(bucket.totalSpend, spendD);
    const existing = bucket.byAccount.get(row.account_id);
    if (existing) {
      existing.spend = add(existing.spend, spendD);
    } else {
      bucket.byAccount.set(row.account_id, { spend: spendD, accountName: row.account_name });
    }
  }

  const categoryGroups: CardOptimizationCategoryRow[] = [];
  const summaryByType = {
    CASHBACK: emptyTotals(),
    POINTS: emptyTotals()
  } satisfies Record<CardOptimizationRewardType, ReturnType<typeof emptyTotals>>;

  for (const group of SPEND_GROUPS) {
    const bucket = groupBuckets.get(group)!;
    if (bucket.byAccount.size === 0 && bucket.totalSpend.isZero()) {
      // No spend in this group — skip to keep response compact.
      continue;
    }

    const best = bestByGroup.get(group) ?? null;
    const bestRate = best ? best.rate : new Decimal(0);

    const byAccount: CardOptimizationAccountSpend[] = [];
    let groupEarnedD = new Decimal(0);
    let groupMissedD = new Decimal(0);

    for (const [accountId, entry] of bucket.byAccount) {
      const benefit = benefitsByKey.get(benefitKey(accountId, group));
      const rateD = benefit ? new Decimal(benefit.reward_rate) : new Decimal(0);
      const earnedD = multiply(rateD, entry.spend);
      const missedRowD = multiply(subtract(bestRate, rateD), entry.spend);
      groupEarnedD = add(groupEarnedD, earnedD);
      groupMissedD = add(groupMissedD, missedRowD);

      byAccount.push({
        account_id: accountId,
        account_name: entry.accountName,
        spend: toStorable(entry.spend),
        reward_rate: rateD.toNumber(),
        reward_type: benefit ? benefit.reward_type : null,
        rewards_earned: toStorable(earnedD)
      });

      if (benefit) {
        summaryByType[benefit.reward_type].earned = add(summaryByType[benefit.reward_type].earned, earnedD);
      }
    }

    byAccount.sort((a, b) => b.spend - a.spend);

    const potentialD = multiply(bestRate, bucket.totalSpend);
    const bestAccountName = best ? (accountNamesById.get(best.accountId) ?? null) : null;

    if (best) {
      summaryByType[best.rewardType].potential = add(summaryByType[best.rewardType].potential, potentialD);
      // Missed in the best card's reward type — bucket potential vs all earnings the user
      // could have captured by routing optimally.
      const earnedSameTypeD = byAccount.reduce((acc, row) => {
        if (row.reward_type === best.rewardType) return add(acc, new Decimal(row.rewards_earned));
        return acc;
      }, new Decimal(0));
      const missedSameTypeD = subtract(potentialD, earnedSameTypeD);
      summaryByType[best.rewardType].missed = add(summaryByType[best.rewardType].missed, missedSameTypeD);
    }

    categoryGroups.push({
      category_group: group,
      total_spend: toStorable(bucket.totalSpend),
      by_account: byAccount,
      best_rate: bestRate.toNumber(),
      best_rate_account_id: best ? best.accountId : null,
      best_rate_account_name: bestAccountName,
      best_reward_type: best ? best.rewardType : null,
      rewards_earned: toStorable(groupEarnedD),
      rewards_potential: toStorable(potentialD),
      missed_rewards: toStorable(groupMissedD)
    });
  }

  const summary: CardOptimizationSummary = {
    cashback: {
      earned: toStorable(summaryByType.CASHBACK.earned),
      potential: toStorable(summaryByType.CASHBACK.potential),
      missed: toStorable(summaryByType.CASHBACK.missed)
    },
    points: {
      earned: toStorable(summaryByType.POINTS.earned),
      potential: toStorable(summaryByType.POINTS.potential),
      missed: toStorable(summaryByType.POINTS.missed)
    }
  };

  return {
    start_month: startMonth,
    end_month: endMonth,
    category_groups: categoryGroups,
    summary
  };
}

export async function analyzeCardOptimization(
  db: PnlDb,
  startMonth: string,
  endMonth: string
): Promise<CardOptimizationResult> {
  const monthExpr = sql<string>`strftime('%Y-%m', ${transactions.date})`;
  const debitSum = sql<number>`SUM(CASE WHEN ${transactions.type} = 'DEBIT' THEN ${transactions.amount} ELSE 0 END)`;

  const spendRowsRaw = await db
    .select({
      categoryGroup: categories.groupType,
      accountId: transactions.accountId,
      accountName: accounts.name,
      spend: debitSum
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .where(
      and(gte(monthExpr, startMonth), lte(monthExpr, endMonth), inArray(categories.groupType, ["FIXED", "VARIABLE"]))
    )
    .groupBy(categories.groupType, transactions.accountId, accounts.name);

  const spendRows: CardOptimizationSpendInput[] = spendRowsRaw
    .filter((r) => r.categoryGroup === "FIXED" || r.categoryGroup === "VARIABLE")
    .map((r) => ({
      category_group: r.categoryGroup as CardOptimizationCategoryGroup,
      account_id: r.accountId,
      account_name: r.accountName,
      spend: Number(r.spend ?? 0)
    }));

  const benefitRowsRaw = await db
    .select({
      accountId: cardBenefits.accountId,
      categoryGroup: cardBenefits.categoryGroup,
      rewardType: cardBenefits.rewardType,
      rewardRate: cardBenefits.rewardRate
    })
    .from(cardBenefits)
    .where(inArray(cardBenefits.categoryGroup, ["FIXED", "VARIABLE"]));

  const benefitRows: CardOptimizationBenefitInput[] = benefitRowsRaw.map((r) => ({
    account_id: r.accountId,
    category_group: r.categoryGroup as CardOptimizationCategoryGroup,
    reward_type: r.rewardType as CardOptimizationRewardType,
    reward_rate: Number(r.rewardRate ?? 0)
  }));

  const accountRows = await db.select({ id: accounts.id, name: accounts.name }).from(accounts);
  const accountNamesById = new Map(accountRows.map((a) => [a.id, a.name]));

  return buildCardOptimizationResult(startMonth, endMonth, spendRows, benefitRows, accountNamesById);
}
