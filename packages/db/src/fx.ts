import { and, eq, inArray } from "drizzle-orm";

import { multiplyCentsByRate } from "@pnl/money";
import { fxRates } from "@pnl/types";

import { getSettings } from "./settings";

import type { MissingFxRate, MonthCurrencyPair } from "@pnl/types";
import type { PnlDb } from "./client";

/**
 * A needed (month, currency) pair has no fx_rates row. Reports hard-error on
 * this rather than showing silently wrong totals (ADR-0003). The router maps
 * it to a structured PRECONDITION_FAILED so clients can prompt for the rates.
 */
export class FxRateMissingError extends Error {
  readonly missing: MissingFxRate[];

  constructor(baseCurrency: string, missing: MissingFxRate[]) {
    const pairs = missing.map((m) => `${m.currency} ${m.month}`).join(", ");
    super(`Missing FX rate(s) to ${baseCurrency} for: ${pairs}`);
    this.name = "FxRateMissingError";
    this.missing = missing;
  }
}

export type FxContext = {
  baseCurrency: string;
  /** Convert integer cents in `currency` for `month` into base-currency cents. */
  toBaseCents: (cents: number, month: string, currency: string) => number;
};

/**
 * Load the base currency and every rate needed to convert the given
 * (month, currency) pairs. Throws FxRateMissingError listing ALL missing
 * pairs up front, so one round-trip surfaces everything to fix.
 */
export async function loadFxContext(db: PnlDb, pairs: Iterable<MonthCurrencyPair>): Promise<FxContext> {
  const { baseCurrency } = await getSettings(db);

  const needed = new Map<string, MonthCurrencyPair>();
  for (const pair of pairs) {
    if (pair.currency === baseCurrency) continue;
    needed.set(`${pair.month}::${pair.currency}`, pair);
  }

  const rateByKey = new Map<string, number>();
  if (needed.size > 0) {
    const months = [...new Set([...needed.values()].map((p) => p.month))];
    const rows = await db
      .select({ month: fxRates.month, currency: fxRates.currency, rate: fxRates.rate })
      .from(fxRates)
      .where(and(eq(fxRates.baseCurrency, baseCurrency), inArray(fxRates.month, months)));
    for (const row of rows) {
      rateByKey.set(`${row.month}::${row.currency}`, row.rate);
    }

    const missing = [...needed.values()].filter((p) => !rateByKey.has(`${p.month}::${p.currency}`));
    if (missing.length > 0) {
      missing.sort((a, b) =>
        a.month === b.month ? a.currency.localeCompare(b.currency) : a.month.localeCompare(b.month)
      );
      throw new FxRateMissingError(baseCurrency, missing);
    }
  }

  return {
    baseCurrency,
    toBaseCents: (cents, month, currency) => {
      if (currency === baseCurrency) return cents;
      const rate = rateByKey.get(`${month}::${currency}`);
      if (rate === undefined) {
        // Callers must declare every pair up front; this indicates a bug, not user data.
        throw new FxRateMissingError(baseCurrency, [{ month, currency }]);
      }
      return multiplyCentsByRate(cents, rate);
    }
  };
}
