import { round2 } from "@pnl/money";

import type { DataQuality } from "@pnl/types";

const WARNING_THRESHOLD_PCT = 5;

export function buildDataQuality(uncategorized: number, total: number): DataQuality {
  const uncategorized_pct = total === 0 ? 0 : round2((uncategorized / total) * 100);
  return {
    uncategorized_count: uncategorized,
    uncategorized_pct,
    warning: uncategorized_pct > WARNING_THRESHOLD_PCT
  };
}
