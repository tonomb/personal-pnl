import type { PnlDb } from "./client";

export function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

type BatchStatement = Parameters<PnlDb["batch"]>[0][number];

/**
 * D1 allows at most 100 bound parameters per statement and we group up to 100
 * statements per db.batch() round-trip. This is the ONLY place that limit is
 * encoded: pass rows and a statement builder with a row-per-statement budget
 * derived from the params each row binds.
 */
export async function batchChunked<T>(
  db: PnlDb,
  rows: T[],
  rowsPerStatement: number,
  toStatement: (rows: T[]) => BatchStatement
): Promise<unknown[]> {
  const statements = chunks(rows, rowsPerStatement).map(toStatement);
  const results: unknown[] = [];
  for (const group of chunks(statements, 100)) {
    const groupResults = (await db.batch(group as [BatchStatement, ...BatchStatement[]])) as unknown[];
    results.push(...groupResults);
  }
  return results;
}
