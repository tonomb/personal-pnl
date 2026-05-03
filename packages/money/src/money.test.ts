import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { add, divide, multiply, safeDivide, subtract, toDisplay, toStorable } from "./money";

describe("add", () => {
  it("avoids float precision errors", () => {
    expect(add(0.1, 0.2).equals(new Decimal("0.3"))).toBe(true);
  });

  it("accepts Decimal instances", () => {
    expect(add(new Decimal("1.5"), new Decimal("2.5")).equals(new Decimal("4"))).toBe(true);
  });
});

describe("subtract", () => {
  it("subtracts two values", () => {
    expect(subtract(10, 3.5).equals(new Decimal("6.5"))).toBe(true);
  });
});

describe("multiply", () => {
  it("multiplies two values", () => {
    expect(multiply(2.5, 4).equals(new Decimal("10"))).toBe(true);
  });
});

describe("divide", () => {
  it("divides two values", () => {
    expect(divide(10, 4).equals(new Decimal("2.5"))).toBe(true);
  });
});

describe("safeDivide", () => {
  it("divides normally when denominator is non-zero", () => {
    expect(safeDivide(100, 4)?.equals(new Decimal("25"))).toBe(true);
  });

  it("returns null when denominator is zero", () => {
    expect(safeDivide(100, 0)).toBeNull();
  });

  it("returns null when denominator is a zero Decimal", () => {
    expect(safeDivide(100, new Decimal(0))).toBeNull();
  });
});

describe("toStorable", () => {
  it("returns a plain number rounded to 2 decimal places", () => {
    const result = toStorable(new Decimal("0.1").add("0.2"));
    expect(result).toBe(0.3);
    expect(typeof result).toBe("number");
  });

  it("rounds to 2 decimal places", () => {
    expect(toStorable(new Decimal("1.005"))).toBe(1.01);
  });
});

describe("toDisplay", () => {
  it("formats as MXN currency string", () => {
    const result = toDisplay(new Decimal("1234.56"));
    expect(result).toContain("1,234");
    expect(result).toContain("56");
  });
});

describe("regression: float drift", () => {
  it("is exact when summing 0.1 one hundred times where raw float drifts", () => {
    let raw = 0;
    let d = new Decimal(0);
    for (let i = 0; i < 100; i++) {
      raw += 0.1;
      d = add(d, 0.1);
    }
    expect(raw).not.toBe(10);
    expect(toStorable(d)).toBe(10);
  });

  it("is exact for canonical 0.1 + 0.2 where raw float drifts", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toStorable(add(0.1, 0.2))).toBe(0.3);
  });

  it("rounds half-up away from zero on negatives (vs Math.round which rounds toward zero)", () => {
    expect(Math.round(-0.005 * 100) / 100).toBe(-0);
    expect(toStorable(new Decimal("-0.005"))).toBe(-0.01);
  });
});
