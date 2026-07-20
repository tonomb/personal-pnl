import { desc, eq } from "drizzle-orm";

import { fxRates } from "@pnl/types";

import { getSettings } from "./settings";

import type { FxRate } from "@pnl/types";
import type { PnlDb } from "./client";

/** Rates for the CURRENT base currency, newest month first. */
export async function listFxRates(db: PnlDb): Promise<{ baseCurrency: string; rates: FxRate[] }> {
  const { baseCurrency } = await getSettings(db);
  const rates = await db
    .select()
    .from(fxRates)
    .where(eq(fxRates.baseCurrency, baseCurrency))
    .orderBy(desc(fxRates.month), fxRates.currency);
  return { baseCurrency, rates };
}

/**
 * Upsert a monthly rate for the current base currency. Rates are pair-keyed
 * (month, base, currency) so a later base switch never corrupts them (ADR-0003).
 */
export async function upsertFxRate(
  db: PnlDb,
  input: { month: string; currency: string; rate: number }
): Promise<FxRate> {
  const { baseCurrency } = await getSettings(db);
  if (input.currency === baseCurrency) {
    throw new Error(`Cannot set a rate from the base currency (${baseCurrency}) to itself`);
  }
  const [row] = await db
    .insert(fxRates)
    .values({ month: input.month, baseCurrency, currency: input.currency, rate: input.rate })
    .onConflictDoUpdate({
      target: [fxRates.month, fxRates.baseCurrency, fxRates.currency],
      set: { rate: input.rate }
    })
    .returning();
  return row!;
}

export async function deleteFxRate(db: PnlDb, id: number): Promise<{ deletedId: number } | null> {
  const [deleted] = await db.delete(fxRates).where(eq(fxRates.id, id)).returning({ id: fxRates.id });
  return deleted ? { deletedId: deleted.id } : null;
}
