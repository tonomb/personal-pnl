import { useState } from "react";

import { Button } from "@/components/ui/button";

interface SheetSelectorProps {
  sheetNames: string[];
  /** Called with the chosen sheet name and 0-indexed header row */
  onSelect: (sheetName: string, headerRow: number) => void;
  onCancel: () => void;
}

export function SheetSelector({ sheetNames, onSelect, onCancel }: SheetSelectorProps) {
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
