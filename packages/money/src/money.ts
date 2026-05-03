import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type Numeric = number | Decimal;

export function add(a: Numeric, b: Numeric): Decimal {
  return new Decimal(a).add(new Decimal(b));
}

export function subtract(a: Numeric, b: Numeric): Decimal {
  return new Decimal(a).sub(new Decimal(b));
}

export function multiply(a: Numeric, b: Numeric): Decimal {
  return new Decimal(a).mul(new Decimal(b));
}

export function divide(a: Numeric, b: Numeric): Decimal {
  return new Decimal(a).div(new Decimal(b));
}

export function safeDivide(numerator: Numeric, denominator: Numeric): Decimal | null {
  const d = new Decimal(denominator);
  if (d.isZero()) return null;
  return new Decimal(numerator).div(d);
}

export function toStorable(d: Decimal): number {
  return d.toDecimalPlaces(2).toNumber();
}

export function toDisplay(d: Decimal): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(d.toNumber());
}
