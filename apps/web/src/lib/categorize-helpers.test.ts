import { describe, expect, it } from "vitest";

import { classifyTargetIds, merchantCategory } from "./categorize-helpers";

import type { TransactionWithCategory } from "@pnl/types";
import type { FlatRow } from "./categorize-helpers";

function aTx(id: string, category?: { id: number; name: string; color: string }): TransactionWithCategory {
  return {
    id,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null
  } as TransactionWithCategory;
}

const food = { id: 1, name: "Food", color: "#22c55e" };
const rent = { id: 2, name: "Rent", color: "#3b82f6" };

const rows: FlatRow[] = [
  {
    kind: "merchant-header",
    merchantKey: "OXXO",
    txIds: ["a", "b"],
    displayName: "Oxxo",
    totals: [],
    category: { kind: "uncategorized" }
  },
  { kind: "transaction", tx: aTx("a") },
  { kind: "transaction", tx: aTx("b") }
];

describe("classifyTargetIds", () => {
  it("targets the selection when there is one, whatever the cursor is on", () => {
    expect(classifyTargetIds(rows, 1, new Set(["b", "z"]))).toEqual(["b", "z"]);
  });

  it("targets every transaction of the merchant under the cursor", () => {
    expect(classifyTargetIds(rows, 0, new Set())).toEqual(["a", "b"]);
  });

  it("targets the single transaction under the cursor", () => {
    expect(classifyTargetIds(rows, 2, new Set())).toEqual(["b"]);
  });

  it("targets nothing when the list is empty or the cursor is out of range", () => {
    expect(classifyTargetIds([], 0, new Set())).toEqual([]);
    expect(classifyTargetIds(rows, 9, new Set())).toEqual([]);
  });
});

describe("merchantCategory", () => {
  it("is uncategorized when no transaction has a category", () => {
    expect(merchantCategory([aTx("a"), aTx("b")])).toEqual({ kind: "uncategorized" });
  });

  it("is the shared category when every transaction has the same one", () => {
    expect(merchantCategory([aTx("a", food), aTx("b", food)])).toEqual({
      kind: "single",
      name: "Food",
      color: "#22c55e"
    });
  });

  it("is mixed when categories differ, including partly uncategorized", () => {
    expect(merchantCategory([aTx("a", food), aTx("b", rent)])).toEqual({ kind: "mixed" });
    expect(merchantCategory([aTx("a", food), aTx("b")])).toEqual({ kind: "mixed" });
  });
});
