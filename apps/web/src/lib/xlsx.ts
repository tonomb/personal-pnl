import * as XLSX from "xlsx";

/**
 * Returns the sheet names from an XLSX/XLS ArrayBuffer.
 * Throws if the buffer is not a valid workbook.
 */
export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  return wb.SheetNames;
}

/**
 * Converts a single sheet in an XLSX/XLS ArrayBuffer to a CSV string.
 * Throws if the buffer is invalid or the sheet name doesn't exist.
 */
export function xlsxToCsvString(buffer: ArrayBuffer, sheetName: string, headerRow = 0): string {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  if (headerRow === 0) return XLSX.utils.sheet_to_csv(sheet);
  // sheet_to_json with range:number starts from that row index (0-based)
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    range: headerRow,
    defval: ""
  });
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}
