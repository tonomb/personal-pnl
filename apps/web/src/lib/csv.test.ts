import { describe, expect, it } from "vitest";

import { generateFingerprint, generateTransactionId, normalizeDate, parseAmount } from "./csv";

describe("generateFingerprint", () => {
  it("is order-independent — same headers in different order produce the same fingerprint", () => {
    expect(generateFingerprint(["B", "A", "C"])).toBe(generateFingerprint(["C", "A", "B"]));
  });

  it("produces different values for different header sets", () => {
    expect(generateFingerprint(["Date", "Amount"])).not.toBe(generateFingerprint(["Date", "Description"]));
  });
});

describe("generateTransactionId", () => {
  it("is deterministic — same inputs always produce the same ID", () => {
    const id1 = generateTransactionId("2024-01-01", "Coffee", 4.5);
    const id2 = generateTransactionId("2024-01-01", "Coffee", 4.5);
    expect(id1).toBe(id2);
  });

  it("produces different IDs for different inputs", () => {
    expect(generateTransactionId("2024-01-01", "Coffee", 4.5)).not.toBe(
      generateTransactionId("2024-01-02", "Coffee", 4.5)
    );
  });
});

describe("normalizeDate", () => {
  it.each([
    // ISO — pass-through
    ["2026-01-31", "2026-01-31"],

    // DD MMM YYYY — Amex Mexico (Fecha / Fecha de Compra columns)
    ["31 Jan 2026", "2026-01-31"],
    ["01 Feb 2026", "2026-02-01"],
    ["1 December 2025", "2025-12-01"],

    // DD/MM/YYYY — Mexican / European bank CSV exports
    ["31/01/2026", "2026-01-31"],
    ["05/03/2026", "2026-03-05"], // ambiguous (both ≤ 12) → DD/MM default

    // MM/DD/YYYY — US format
    ["01/31/2026", "2026-01-31"],

    // YYYY/MM/DD
    ["2026/01/31", "2026-01-31"],

    // D/M/YY — short form
    ["1/3/26", "2026-03-01"],
    ["15/6/90", "1990-06-15"] // 2-digit year ≥ 50 → 19xx
  ])('normalizes "%s" → "%s"', (input, expected) => {
    expect(normalizeDate(input)).toBe(expected);
  });

  it.each(["not a date", "", "  ", "13/13/2026"])('returns null for unparseable "%s"', (input) => {
    expect(normalizeDate(input)).toBeNull();
  });
});

describe("parseAmount", () => {
  it("parses dollar-formatted positive amount as CREDIT", () => {
    expect(parseAmount("$1,234.56")).toEqual({ amount: 1234.56, type: "CREDIT" });
  });

  it("parses parenthesized amount as DEBIT", () => {
    expect(parseAmount("(500.00)")).toEqual({ amount: 500, type: "DEBIT" });
  });

  it("parses negative amount as DEBIT", () => {
    expect(parseAmount("-500.00")).toEqual({ amount: 500, type: "DEBIT" });
  });

  it("parses plain positive number as CREDIT", () => {
    expect(parseAmount("1234.56")).toEqual({ amount: 1234.56, type: "CREDIT" });
  });

  it("parses zero as CREDIT", () => {
    expect(parseAmount("0.00")).toEqual({ amount: 0, type: "CREDIT" });
  });
});
