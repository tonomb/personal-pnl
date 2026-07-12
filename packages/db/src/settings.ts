import { eq } from "drizzle-orm";

import { settings } from "@pnl/types";

import type { Settings } from "@pnl/types";
import type { PnlDb } from "./client";

const SETTINGS_ROW_ID = 1;
const DEFAULT_BASE_CURRENCY = "MXN";

export async function getSettings(db: PnlDb): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, SETTINGS_ROW_ID)).limit(1);
  return row ?? { id: SETTINGS_ROW_ID, baseCurrency: DEFAULT_BASE_CURRENCY };
}

export async function updateSettings(db: PnlDb, patch: { baseCurrency: string }): Promise<Settings> {
  const [row] = await db
    .insert(settings)
    .values({ id: SETTINGS_ROW_ID, baseCurrency: patch.baseCurrency })
    .onConflictDoUpdate({ target: settings.id, set: { baseCurrency: patch.baseCurrency } })
    .returning();
  return row!;
}
