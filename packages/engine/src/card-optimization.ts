import { centsToAmount, multiplyCentsByRate } from "@pnl/money";

import type {
  CardOptimizationAccountSpend,
  CardOptimizationCategoryGroup,
  CardOptimizationCategoryRow,
  CardOptimizationResult,
  CardOptimizationRewardType,
  CardOptimizationSummary
} from "@pnl/types";
import type { RollupCell } from "./rollup-cell";

const SPEND_GROUPS: CardOptimizationCategoryGroup[] = ["FIXED", "VARIABLE"];

export type CardOptimizationBenefit = {
  accountId: string;
  accountName: string;
  categoryGroup: CardOptimizationCategoryGroup;
  rewardType: CardOptimizationRewardType;
  rewardRate: number;
};

type BenefitKey = `${string}::${CardOptimizationCategoryGroup}`;

function benefitKey(accountId: string, group: CardOptimizationCategoryGroup): BenefitKey {
  return `${accountId}::${group}`;
}

function emptyTotals() {
  return { earnedCents: 0, potentialCents: 0, missedCents: 0 };
}

/**
 * Spend per category group per account (from rollup cells — every transaction
 * in FIXED/VARIABLE categories counts, ADR-0002) vs each card's benefits.
 */
export function buildCardOptimizationResult(
  startMonth: string,
  endMonth: string,
  cells: RollupCell[],
  benefits: CardOptimizationBenefit[],
  currency: string
): CardOptimizationResult {
  const benefitsByKey = new Map<BenefitKey, CardOptimizationBenefit>();
  const bestByGroup = new Map<CardOptimizationCategoryGroup, CardOptimizationBenefit>();

  for (const b of benefits) {
    benefitsByKey.set(benefitKey(b.accountId, b.categoryGroup), b);
    const current = bestByGroup.get(b.categoryGroup);
    if (!current || b.rewardRate > current.rewardRate) {
      bestByGroup.set(b.categoryGroup, b);
    }
  }

  type GroupBucket = {
    totalSpendCents: number;
    byAccount: Map<string, { spendCents: number; accountName: string }>;
  };
  const groupBuckets = new Map<CardOptimizationCategoryGroup, GroupBucket>();
  for (const group of SPEND_GROUPS) {
    groupBuckets.set(group, { totalSpendCents: 0, byAccount: new Map() });
  }

  for (const cell of cells) {
    if (cell.groupType !== "FIXED" && cell.groupType !== "VARIABLE") continue;
    const bucket = groupBuckets.get(cell.groupType)!;
    bucket.totalSpendCents += cell.cents;
    const existing = bucket.byAccount.get(cell.accountId);
    if (existing) {
      existing.spendCents += cell.cents;
    } else {
      bucket.byAccount.set(cell.accountId, { spendCents: cell.cents, accountName: cell.accountName });
    }
  }

  const categoryGroups: CardOptimizationCategoryRow[] = [];
  const summaryByType = {
    CASHBACK: emptyTotals(),
    POINTS: emptyTotals()
  } satisfies Record<CardOptimizationRewardType, ReturnType<typeof emptyTotals>>;

  for (const group of SPEND_GROUPS) {
    const bucket = groupBuckets.get(group)!;
    if (bucket.byAccount.size === 0 && bucket.totalSpendCents === 0) {
      // No spend in this group — skip to keep the response compact.
      continue;
    }

    const best = bestByGroup.get(group) ?? null;
    const bestRate = best ? best.rewardRate : 0;

    const byAccount: CardOptimizationAccountSpend[] = [];
    let groupEarnedCents = 0;
    let groupMissedCents = 0;

    for (const [accountId, entry] of bucket.byAccount) {
      const benefit = benefitsByKey.get(benefitKey(accountId, group));
      const rate = benefit ? benefit.rewardRate : 0;
      const earnedCents = multiplyCentsByRate(entry.spendCents, rate);
      groupEarnedCents += earnedCents;
      groupMissedCents += multiplyCentsByRate(entry.spendCents, bestRate - rate);

      byAccount.push({
        account_id: accountId,
        account_name: entry.accountName,
        spend: centsToAmount(entry.spendCents),
        reward_rate: rate,
        reward_type: benefit ? benefit.rewardType : null,
        rewards_earned: centsToAmount(earnedCents)
      });

      if (benefit) {
        summaryByType[benefit.rewardType].earnedCents += earnedCents;
      }
    }

    byAccount.sort((a, b) => b.spend - a.spend);

    const potentialCents = multiplyCentsByRate(bucket.totalSpendCents, bestRate);

    if (best) {
      summaryByType[best.rewardType].potentialCents += potentialCents;
      // Missed in the best card's reward type — bucket potential vs all
      // earnings the user could have captured by routing optimally.
      const earnedSameTypeCents = byAccount.reduce((acc, row) => {
        if (row.reward_type === best.rewardType) {
          const benefit = benefitsByKey.get(benefitKey(row.account_id, group))!;
          return acc + multiplyCentsByRate(bucket.byAccount.get(row.account_id)!.spendCents, benefit.rewardRate);
        }
        return acc;
      }, 0);
      summaryByType[best.rewardType].missedCents += potentialCents - earnedSameTypeCents;
    }

    categoryGroups.push({
      category_group: group,
      total_spend: centsToAmount(bucket.totalSpendCents),
      by_account: byAccount,
      best_rate: bestRate,
      best_rate_account_id: best ? best.accountId : null,
      best_rate_account_name: best ? best.accountName : null,
      best_reward_type: best ? best.rewardType : null,
      rewards_earned: centsToAmount(groupEarnedCents),
      rewards_potential: centsToAmount(potentialCents),
      missed_rewards: centsToAmount(groupMissedCents)
    });
  }

  const summary: CardOptimizationSummary = {
    cashback: {
      earned: centsToAmount(summaryByType.CASHBACK.earnedCents),
      potential: centsToAmount(summaryByType.CASHBACK.potentialCents),
      missed: centsToAmount(summaryByType.CASHBACK.missedCents)
    },
    points: {
      earned: centsToAmount(summaryByType.POINTS.earnedCents),
      potential: centsToAmount(summaryByType.POINTS.potentialCents),
      missed: centsToAmount(summaryByType.POINTS.missedCents)
    }
  };

  return {
    start_month: startMonth,
    end_month: endMonth,
    currency,
    category_groups: categoryGroups,
    summary
  };
}
