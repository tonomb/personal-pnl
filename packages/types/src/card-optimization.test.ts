import { describe, expect, it } from "vitest";

import { buildCardOptimizationResult } from "./card-optimization";

import type { CardOptimizationBenefitInput, CardOptimizationSpendInput } from "./card-optimization";

const accountNames = new Map<string, string>([
  ["acc-cashback", "Cashback Card"],
  ["acc-points", "Points Card"],
  ["acc-bare", "Bare Debit"]
]);

describe("buildCardOptimizationResult", () => {
  it("returns empty groups and zero summary when there is no spend", () => {
    const result = buildCardOptimizationResult("2026-01", "2026-03", [], [], accountNames);

    expect(result.start_month).toBe("2026-01");
    expect(result.end_month).toBe("2026-03");
    expect(result.category_groups).toEqual([]);
    expect(result.summary).toEqual({
      cashback: { earned: 0, potential: 0, missed: 0 },
      points: { earned: 0, potential: 0, missed: 0 }
    });
  });

  it("computes earned, potential, and missed for a single category group", () => {
    const spend: CardOptimizationSpendInput[] = [
      { category_group: "VARIABLE", account_id: "acc-cashback", account_name: "Cashback Card", spend: 600 },
      { category_group: "VARIABLE", account_id: "acc-bare", account_name: "Bare Debit", spend: 400 }
    ];
    const benefits: CardOptimizationBenefitInput[] = [
      { account_id: "acc-cashback", category_group: "VARIABLE", reward_type: "CASHBACK", reward_rate: 0.03 }
    ];

    const result = buildCardOptimizationResult("2026-01", "2026-01", spend, benefits, accountNames);

    expect(result.category_groups).toHaveLength(1);
    const group = result.category_groups[0]!;
    expect(group.category_group).toBe("VARIABLE");
    expect(group.total_spend).toBe(1000);
    expect(group.best_rate).toBeCloseTo(0.03);
    expect(group.best_rate_account_id).toBe("acc-cashback");
    expect(group.best_reward_type).toBe("CASHBACK");
    // Earned: 0.03 * 600 + 0 * 400 = 18
    expect(group.rewards_earned).toBe(18);
    // Potential: 0.03 * 1000 = 30
    expect(group.rewards_potential).toBe(30);
    // Missed: (0.03 - 0.03)*600 + (0.03 - 0)*400 = 12
    expect(group.missed_rewards).toBe(12);

    const bare = group.by_account.find((r) => r.account_id === "acc-bare")!;
    expect(bare.reward_rate).toBe(0);
    expect(bare.reward_type).toBeNull();
    expect(bare.rewards_earned).toBe(0);

    expect(result.summary.cashback).toEqual({ earned: 18, potential: 30, missed: 12 });
    expect(result.summary.points).toEqual({ earned: 0, potential: 0, missed: 0 });
  });

  it("keeps cashback and points separate in the summary", () => {
    const spend: CardOptimizationSpendInput[] = [
      // Dining (VARIABLE) — best is points
      { category_group: "VARIABLE", account_id: "acc-cashback", account_name: "Cashback Card", spend: 200 },
      { category_group: "VARIABLE", account_id: "acc-points", account_name: "Points Card", spend: 300 },
      // Bills (FIXED) — best is cashback
      { category_group: "FIXED", account_id: "acc-cashback", account_name: "Cashback Card", spend: 1000 }
    ];
    const benefits: CardOptimizationBenefitInput[] = [
      { account_id: "acc-cashback", category_group: "VARIABLE", reward_type: "CASHBACK", reward_rate: 0.02 },
      { account_id: "acc-points", category_group: "VARIABLE", reward_type: "POINTS", reward_rate: 5 },
      { account_id: "acc-cashback", category_group: "FIXED", reward_type: "CASHBACK", reward_rate: 0.015 }
    ];

    const result = buildCardOptimizationResult("2026-01", "2026-02", spend, benefits, accountNames);

    expect(result.category_groups).toHaveLength(2);
    const variable = result.category_groups.find((g) => g.category_group === "VARIABLE")!;
    const fixed = result.category_groups.find((g) => g.category_group === "FIXED")!;

    expect(variable.best_reward_type).toBe("POINTS");
    expect(variable.best_rate).toBe(5);
    // Potential at 5x on $500 total = 2500
    expect(variable.rewards_potential).toBe(2500);

    expect(fixed.best_reward_type).toBe("CASHBACK");
    // 0.015 * 1000 = 15
    expect(fixed.rewards_potential).toBe(15);

    // Cashback summary: earned (0.02 * 200) + (0.015 * 1000) = 4 + 15 = 19
    // Cashback potential: only fixed group's potential = 15
    // Cashback missed: 15 - 15 = 0 (cashback card already optimal on FIXED)
    expect(result.summary.cashback.earned).toBe(19);
    expect(result.summary.cashback.potential).toBe(15);
    expect(result.summary.cashback.missed).toBe(0);

    // Points summary: earned 5 * 300 = 1500
    // Points potential: variable group only = 2500
    // Points missed: 2500 - 1500 = 1000
    expect(result.summary.points.earned).toBe(1500);
    expect(result.summary.points.potential).toBe(2500);
    expect(result.summary.points.missed).toBe(1000);
  });

  it("treats accounts with no card_benefits as reward_rate 0", () => {
    const spend: CardOptimizationSpendInput[] = [
      { category_group: "VARIABLE", account_id: "acc-bare", account_name: "Bare Debit", spend: 500 }
    ];

    const result = buildCardOptimizationResult("2026-01", "2026-01", spend, [], accountNames);

    const group = result.category_groups[0]!;
    expect(group.best_rate).toBe(0);
    expect(group.best_reward_type).toBeNull();
    expect(group.rewards_earned).toBe(0);
    expect(group.rewards_potential).toBe(0);
    expect(group.missed_rewards).toBe(0);
    expect(group.by_account[0]!.reward_type).toBeNull();
  });

  it("aggregates duplicate spend rows for the same account+group", () => {
    const spend: CardOptimizationSpendInput[] = [
      { category_group: "VARIABLE", account_id: "acc-cashback", account_name: "Cashback Card", spend: 100 },
      { category_group: "VARIABLE", account_id: "acc-cashback", account_name: "Cashback Card", spend: 250 }
    ];
    const benefits: CardOptimizationBenefitInput[] = [
      { account_id: "acc-cashback", category_group: "VARIABLE", reward_type: "CASHBACK", reward_rate: 0.04 }
    ];

    const result = buildCardOptimizationResult("2026-01", "2026-01", spend, benefits, accountNames);
    const group = result.category_groups[0]!;
    expect(group.total_spend).toBe(350);
    expect(group.by_account).toHaveLength(1);
    expect(group.by_account[0]!.spend).toBe(350);
    expect(group.rewards_earned).toBe(14);
  });
});
