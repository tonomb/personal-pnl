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
  it("passes through already-ISO dates unchanged", () => {
    expect(normalizeDate("2026-01-31")).toBe("2026-01-31");
  });

  it("parses DD MMM YYYY (Amex Mexico format)", () => {
    expect(normalizeDate("31 Jan 2026")).toBe("2026-01-31");
    expect(normalizeDate("01 Feb 2026")).toBe("2026-02-01");
    expect(normalizeDate("1 December 2025")).toBe("2025-12-01");
  });

  it("parses DD/MM/YYYY when day > 12", () => {
    expect(normalizeDate("31/01/2026")).toBe("2026-01-31");
  });

  it("parses MM/DD/YYYY when month <= 12 and day > 12", () => {
    expect(normalizeDate("01/31/2026")).toBe("2026-01-31");
  });

  it("defaults to DD/MM when both parts ≤ 12", () => {
    expect(normalizeDate("05/03/2026")).toBe("2026-03-05");
  });

  it("parses YYYY/MM/DD", () => {
    expect(normalizeDate("2026/01/31")).toBe("2026-01-31");
  });

  it("parses D/M/YY short form", () => {
    expect(normalizeDate("1/3/26")).toBe("2026-03-01");
  });

  it("handles two-digit year >= 50 as 19xx", () => {
    expect(normalizeDate("15/06/90")).toBe("1990-06-15");
  });

  it("returns null for unparseable strings", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
    expect(normalizeDate("  ")).toBeNull();
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
