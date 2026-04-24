import { describe, expect, it } from "vitest";

import { generateFingerprint, generateTransactionId, parseAmount } from "./csv";

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
