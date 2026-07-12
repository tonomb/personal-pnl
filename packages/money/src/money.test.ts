import { describe, expect, it } from "vitest";
import { centsToAmount, multiplyCentsByRate, ratioOrNull, round2, round4, toCents } from "./money";

describe("toCents", () => {
  it("converts a major-unit amount to integer cents", () => {
    expect(toCents(12.34)).toBe(1234);
    expect(toCents(0)).toBe(0);
  });

  it("is exact where naive float multiplication drifts", () => {
    // 1.005 * 100 === 100.49999999999999 → Math.round gives 100
    expect(Math.round(1.005 * 100)).toBe(100);
    expect(toCents(1.005)).toBe(101);
  });

  it("parses string amounts (CSV values) exactly", () => {
    expect(toCents("1234.56")).toBe(123456);
    expect(toCents("0.07")).toBe(7);
  });

  it("rounds sub-cent precision half-up", () => {
    expect(toCents(1.234)).toBe(123);
    expect(toCents(1.235)).toBe(124);
  });
});

describe("centsToAmount", () => {
  it("converts integer cents back to a 2dp amount", () => {
    expect(centsToAmount(123456)).toBe(1234.56);
    expect(centsToAmount(7)).toBe(0.07);
    expect(centsToAmount(0)).toBe(0);
  });

  it("round-trips with toCents", () => {
    for (const amount of [0.01, 0.1, 0.3, 19.99, 1234.56, 99999.99]) {
      expect(centsToAmount(toCents(amount))).toBe(amount);
    }
  });
});

describe("round2", () => {
  it("rounds to 2 decimal places half-up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds half-up away from zero on negatives (vs Math.round which rounds toward zero)", () => {
    expect(Math.round(-0.005 * 100) / 100).toBe(-0);
    expect(round2(-0.005)).toBe(-0.01);
  });
});

describe("round4", () => {
  it("rounds rates to 4 decimal places", () => {
    expect(round4(0.75649)).toBe(0.7565);
    expect(round4(1 / 3)).toBe(0.3333);
  });
});

describe("ratioOrNull", () => {
  it("returns the 4dp ratio when the denominator is non-zero", () => {
    expect(ratioOrNull(1500, 2000)).toBe(0.75);
    expect(ratioOrNull(1, 3)).toBe(0.3333);
  });

  it("returns null when the denominator is zero", () => {
    expect(ratioOrNull(100, 0)).toBeNull();
  });
});

describe("multiplyCentsByRate", () => {
  it("applies an FX rate to cents and returns integer cents", () => {
    // 100.00 USD at 17.25 MXN/USD = 1725.00 MXN
    expect(multiplyCentsByRate(10000, 17.25)).toBe(172500);
  });

  it("applies a reward rate and rounds half-up", () => {
    // 3% of $10.25 = 30.75 cents → 31
    expect(multiplyCentsByRate(1025, 0.03)).toBe(31);
  });

  it("is exact where float multiplication drifts", () => {
    // 8228 * 0.145 = 1193.0599999999999 in floats
    expect(multiplyCentsByRate(8228, 0.145)).toBe(1193);
  });
});

describe("regression: aggregation is exact in cents", () => {
  it("summing 0.1 one hundred times drifts in floats but not in cents", () => {
    let raw = 0;
    let cents = 0;
    for (let i = 0; i < 100; i++) {
      raw += 0.1;
      cents += toCents(0.1);
    }
    expect(raw).not.toBe(10);
    expect(centsToAmount(cents)).toBe(10);
  });
});
