import Decimal from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

/**
 * Money moves through the system in two representations (ADR-0001):
 * - cents: positive integer minor units — the storage and aggregation form
 * - amount: major units with at most 2dp — the only form the API and UI see
 *
 * decimal.js is confined to this module; everything downstream works with
 * exact integer cents or already-rounded amounts.
 */

/** Parse a major-unit amount (number or string) into integer cents. */
export function toCents(amount: number | string): number {
  return new Decimal(amount).mul(100).toDecimalPlaces(0).toNumber();
}

/** Convert integer cents back to a major-unit amount (≤2dp). */
export function centsToAmount(cents: number): number {
  return new Decimal(cents).div(100).toDecimalPlaces(2).toNumber();
}

/** Round a major-unit amount to 2dp (HALF_UP). */
export function round2(n: number): number {
  return new Decimal(n).toDecimalPlaces(2).toNumber();
}

/** Round a rate/ratio to 4dp (HALF_UP) — rates are not money (spec 02, decision D7). */
export function round4(n: number): number {
  return new Decimal(n).toDecimalPlaces(4).toNumber();
}

/** numerator/denominator rounded to 4dp, or null when the denominator is 0. */
export function ratioOrNull(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return round4(numerator / denominator);
}

/** Multiply integer cents by a rate (FX or reward rate), back to integer cents. */
export function multiplyCentsByRate(cents: number, rate: number): number {
  return new Decimal(cents).mul(rate).toDecimalPlaces(0).toNumber();
}

/** Sum major-unit amounts exactly (via cents) — never fold amounts with `+`. */
export function sumAmounts(amounts: number[]): number {
  return centsToAmount(amounts.reduce((sum, a) => sum + toCents(a), 0));
}
