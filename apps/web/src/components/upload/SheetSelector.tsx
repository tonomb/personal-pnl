import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SheetSelectorProps {
  sheetNames: string[];
  /** Called with the chosen sheet name and 0-indexed header row */
  onSelect: (sheetName: string, headerRow: number) => void;
  onCancel: () => void;
  /** Top rows of a sheet, untouched, so the user can see where the headers are */
  getPreviewRows?: (sheetName: string) => string[][];
}

export function SheetSelector({ sheetNames, onSelect, onCancel, getPreviewRows }: SheetSelectorProps) {
  const isMultiSheet = sheetNames.length > 1;
  const [selected, setSelected] = useState<string>(isMultiSheet ? "" : sheetNames[0]);
  const [inputValue, setInputValue] = useState<string>("1");
  const [inputError, setInputError] = useState<string>("");

  function validateAndSet(raw: string) {
    setInputValue(raw);
    if (raw === "") {
      setInputError("Enter a positive whole number");
    } else if (!/^\d+$/.test(raw)) {
      setInputError("Enter a positive whole number");
    } else if (parseInt(raw, 10) < 1) {
      setInputError("Must be at least 1");
    } else {
      setInputError("");
    }
  }

  function handleConfirm() {
    const parsed = parseInt(inputValue, 10);
    onSelect(selected, parsed - 1);
  }

  const isInputValid =
    inputError === "" && inputValue !== "" && /^\d+$/.test(inputValue) && parseInt(inputValue, 10) >= 1;

  const previewRows = useMemo(() => {
    if (!getPreviewRows || !selected) return [];
    try {
      return getPreviewRows(selected);
    } catch {
      return [];
    }
  }, [getPreviewRows, selected]);
  const columnCount = Math.max(0, ...previewRows.map((row) => row.length));
  const headerRowNumber = isInputValid ? parseInt(inputValue, 10) : null;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-medium">
        {isMultiSheet ? "This workbook has multiple sheets. Select the one to import:" : "Configure import options:"}
      </p>

      {isMultiSheet && (
        <div className="flex flex-col gap-1">
          <label htmlFor="sheet-select" className="text-xs font-medium text-muted-foreground">
            Sheet
          </label>
          <select
            id="sheet-select"
            aria-label="Sheet"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
          >
            <option value="">— select —</option>
            {sheetNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="header-row" className="text-xs font-medium text-muted-foreground">
          Header row
        </label>
        <input
          id="header-row"
          aria-label="Header row"
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => validateAndSet(e.target.value)}
          aria-invalid={inputError !== ""}
          aria-describedby={inputError ? "header-row-error" : "header-row-hint"}
          className={`h-8 w-24 rounded-lg border bg-transparent px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/50 ${
            inputError
              ? "border-destructive focus:border-destructive focus:ring-destructive/50"
              : "border-input focus:border-ring"
          }`}
        />
        {inputError ? (
          <p id="header-row-error" role="alert" className="text-xs text-destructive">
            {inputError}
          </p>
        ) : (
          <p id="header-row-hint" className="text-muted-foreground text-xs">
            Row number where column headers appear (1 = first row)
          </p>
        )}
      </div>

      {previewRows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            File preview{" "}
            <span className="text-muted-foreground font-normal">
              (first {previewRows.length} {previewRows.length === 1 ? "row" : "rows"}) — click the row that contains the
              column headers
            </span>
          </p>
          <Table aria-label="File preview">
            <TableBody>
              {previewRows.map((row, i) => {
                const rowNumber = i + 1;
                const isHeader = rowNumber === headerRowNumber;
                const isSkipped = headerRowNumber !== null && rowNumber < headerRowNumber;
                return (
                  <TableRow
                    key={i}
                    aria-selected={isHeader}
                    onClick={() => validateAndSet(String(rowNumber))}
                    className={cn(
                      "cursor-pointer",
                      isHeader && "bg-muted font-medium",
                      isSkipped && "text-muted-foreground/60"
                    )}
                  >
                    <TableCell className="w-10 text-muted-foreground tabular-nums">
                      <button type="button" aria-label={`Use row ${rowNumber} as header`}>
                        {rowNumber}
                      </button>
                    </TableCell>
                    {Array.from({ length: columnCount }, (_, c) => (
                      <TableCell key={c}>{row[c] ?? ""}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex gap-2">
        <Button disabled={!selected || !isInputValid} onClick={handleConfirm}>
          Confirm
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
