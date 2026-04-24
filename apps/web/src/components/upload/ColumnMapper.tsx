import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface MappingState {
  dateCol: string | undefined;
  descriptionCol: string | undefined;
  amountCol: string | undefined;
  debitCol: string | undefined;
  creditCol: string | undefined;
  useDebitCredit: boolean;
}

interface ColumnMapperProps {
  fileName: string;
  headers: string[];
  previewRows: string[][];
  onConfirm: (mapping: MappingState) => void;
  onCancel: () => void;
}

function FieldSelect({
  label,
  value,
  headers,
  onChange
}: {
  label: string;
  value: string | undefined;
  headers: string[];
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
      >
        <option value="">— select —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ColumnMapper({ fileName, headers, previewRows, onConfirm, onCancel }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<MappingState>({
    dateCol: undefined,
    descriptionCol: undefined,
    amountCol: undefined,
    debitCol: undefined,
    creditCol: undefined,
    useDebitCredit: false
  });

  function set(field: keyof MappingState, value: string | boolean | undefined) {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }

  const isValid = Boolean(
    mapping.dateCol &&
    mapping.descriptionCol &&
    (mapping.useDebitCredit ? mapping.debitCol && mapping.creditCol : mapping.amountCol)
  );

  // Columns to show in preview: only mapped ones
  const previewCols: { field: string; col: string }[] = [
    mapping.dateCol ? { field: "Date", col: mapping.dateCol } : null,
    mapping.descriptionCol ? { field: "Description", col: mapping.descriptionCol } : null,
    mapping.useDebitCredit && mapping.debitCol ? { field: "Debit", col: mapping.debitCol } : null,
    mapping.useDebitCredit && mapping.creditCol ? { field: "Credit", col: mapping.creditCol } : null,
    !mapping.useDebitCredit && mapping.amountCol ? { field: "Amount", col: mapping.amountCol } : null
  ].filter(Boolean) as { field: string; col: string }[];

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-medium">
        Map columns for <span className="font-mono">{fileName}</span>
      </p>

      {/* Mapping selects */}
      <div className="flex flex-wrap gap-4">
        <FieldSelect
          label="Date"
          value={mapping.dateCol}
          headers={headers}
          onChange={(v) => set("dateCol", v || undefined)}
        />
        <FieldSelect
          label="Description"
          value={mapping.descriptionCol}
          headers={headers}
          onChange={(v) => set("descriptionCol", v || undefined)}
        />
        {mapping.useDebitCredit ? (
          <>
            <FieldSelect
              label="Debit"
              value={mapping.debitCol}
              headers={headers}
              onChange={(v) => set("debitCol", v || undefined)}
            />
            <FieldSelect
              label="Credit"
              value={mapping.creditCol}
              headers={headers}
              onChange={(v) => set("creditCol", v || undefined)}
            />
          </>
        ) : (
          <FieldSelect
            label="Amount"
            value={mapping.amountCol}
            headers={headers}
            onChange={(v) => set("amountCol", v || undefined)}
          />
        )}
      </div>

      {/* Toggle debit/credit mode */}
      <button
        type="button"
        onClick={() =>
          setMapping((prev) => ({
            ...prev,
            useDebitCredit: !prev.useDebitCredit,
            amountCol: undefined,
            debitCol: undefined,
            creditCol: undefined
          }))
        }
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        {mapping.useDebitCredit ? "Use single Amount column" : "Use separate Debit / Credit columns"}
      </button>

      {/* Preview table */}
      {previewCols.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              {previewCols.map(({ field }) => (
                <TableHead key={field}>{field}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, i) => (
              <TableRow key={i}>
                {previewCols.map(({ col }) => {
                  const colIndex = headers.indexOf(col);
                  return <TableCell key={col}>{row[colIndex]}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button disabled={!isValid} onClick={() => onConfirm(mapping)}>
          Confirm mapping
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
