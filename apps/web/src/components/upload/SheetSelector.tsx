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
  // 1-indexed for display; converted to 0-indexed on confirm
  const [headerRowDisplay, setHeaderRowDisplay] = useState<number>(1);

  function handleConfirm() {
    onSelect(selected, headerRowDisplay - 1);
  }

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
          type="number"
          min={1}
          value={headerRowDisplay}
          onChange={(e) => setHeaderRowDisplay(Math.max(1, parseInt(e.target.value) || 1))}
          className="h-8 w-24 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
        />
        <p className="text-muted-foreground text-xs">Row number where column headers appear (1 = first row)</p>
      </div>

      <div className="flex gap-2">
        <Button disabled={!selected} onClick={handleConfirm}>
          Confirm
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
