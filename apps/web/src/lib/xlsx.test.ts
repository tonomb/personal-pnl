import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { getSheetNames, xlsxToCsvString } from "./xlsx";

// ---------------------------------------------------------------------------
// Helpers to build in-memory workbook ArrayBuffers without fixture files
// ---------------------------------------------------------------------------

function makeWorkbookBuffer(sheets: Array<{ name: string; data: Array<Array<string | number>> }>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const { name, data } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), name);
  }
  // XLSX.write with type:'array' may return a plain number[] or Uint8Array depending on env
  const raw = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array | number[];
  const uint8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw as number[]);
  return uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
}

const SINGLE_SHEET_DATA = [
  ["Date", "Description", "Amount"],
  ["2024-01-01", "Coffee", "4.50"],
  ["2024-01-02", "Rent", "1200.00"]
];

// Mimics the Amex XLSX layout: 6 metadata rows then real headers on row 6 (0-indexed)
const SHEET_WITH_METADATA = [
  ["Report Title", "", "", ""],
  ["Prepared for", "", "", ""],
  ["A MARTINEZ", "", "", ""],
  ["Account", "", "", ""],
  ["XXXX-31009", "", "", ""],
  ["", "", "", ""],
  ["Date", "Description", "Amount", "Extra"],
  ["2024-01-01", "Coffee", "4.50", ""],
  ["2024-01-02", "Rent", "1200.00", ""]
];

const MULTI_SHEET_WORKBOOK = [
  { name: "Sheet1", data: SINGLE_SHEET_DATA },
  {
    name: "Savings",
    data: [
      ["Date", "Note"],
      ["2024-02-01", "Transfer"]
    ]
  }
];

// ---------------------------------------------------------------------------
// getSheetNames
// ---------------------------------------------------------------------------

describe("getSheetNames", () => {
  it("returns a single-element array for a one-sheet workbook", () => {
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SINGLE_SHEET_DATA }]);
    expect(getSheetNames(buf)).toEqual(["Sheet1"]);
  });

  it("returns all sheet names from a multi-sheet workbook", () => {
    const buf = makeWorkbookBuffer(MULTI_SHEET_WORKBOOK);
    expect(getSheetNames(buf)).toEqual(["Sheet1", "Savings"]);
  });

  it("does not throw for unrecognized data — returns whatever SheetJS extracts", () => {
    // SheetJS 0.18.x parses garbage gracefully (no throw); our wrapper does the same.
    // The returned sheet list is SheetJS-defined and may be empty or contain a default sheet.
    const garbage = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
    expect(() => getSheetNames(garbage)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// xlsxToCsvString
// ---------------------------------------------------------------------------

describe("xlsxToCsvString", () => {
  it("converts a single-sheet workbook to a CSV string", () => {
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SINGLE_SHEET_DATA }]);
    const csv = xlsxToCsvString(buf, "Sheet1");
    expect(csv).toContain("Date,Description,Amount");
    expect(csv).toContain("Coffee");
    expect(csv).toContain("Rent");
  });

  it("converts a named sheet from a multi-sheet workbook", () => {
    const buf = makeWorkbookBuffer(MULTI_SHEET_WORKBOOK);
    const csv = xlsxToCsvString(buf, "Savings");
    expect(csv).toContain("Date,Note");
    expect(csv).toContain("Transfer");
    expect(csv).not.toContain("Coffee");
  });

  it("throws an Error if the sheet name does not exist", () => {
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SINGLE_SHEET_DATA }]);
    expect(() => xlsxToCsvString(buf, "NonExistent")).toThrow('Sheet "NonExistent" not found');
  });

  it("throws an Error when a specific sheet name is requested but not in the workbook", () => {
    // If the user requests "MyData" but only "Sheet1" exists, we throw clearly.
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SINGLE_SHEET_DATA }]);
    expect(() => xlsxToCsvString(buf, "MyData")).toThrow('Sheet "MyData" not found');
  });

  it("skips metadata rows when headerRow is specified", () => {
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SHEET_WITH_METADATA }]);
    // Real headers start at row index 6
    const csv = xlsxToCsvString(buf, "Sheet1", 6);
    expect(csv).toContain("Date,Description,Amount");
    expect(csv).toContain("Coffee");
    expect(csv).not.toContain("Report Title");
    expect(csv).not.toContain("Prepared for");
  });

  it("defaults to row 0 (no skip) when headerRow is omitted", () => {
    const buf = makeWorkbookBuffer([{ name: "Sheet1", data: SHEET_WITH_METADATA }]);
    const csv = xlsxToCsvString(buf, "Sheet1");
    expect(csv).toContain("Report Title");
  });
});
