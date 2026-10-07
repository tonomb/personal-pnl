import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AccountSelector } from "@/components/accounts/AccountSelector";
import { normalizeDate } from "@/lib/csv";

import type { AccountWithBenefits, TransactionType } from "@pnl/types";

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
  accounts: AccountWithBenefits[];
  initialAccountId?: string | null;
  initialMapping?: MappingState;
  /**
   * `positiveAmountType` is the Type a positive amount gets — the account's
   * stored convention, or the user's answer when the account has none yet.
   * Undefined in Debit / Credit column mode, where the columns decide.
   */
  onConfirm: (mapping: MappingState, accountId: string, positiveAmountType?: TransactionType) => void;
  onCancel: () => void;
}

const POSITIVE_AMOUNT_LABELS: Record<TransactionType, string> = {
  DEBIT: "Money out (charges, withdrawals)",
  CREDIT: "Money in (deposits, payments)"
};

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

export function ColumnMapper({
  fileName,
  headers,
  previewRows,
  accounts,
  initialAccountId,
  initialMapping,
  onConfirm,
  onCancel
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<MappingState>(
    initialMapping ?? {
      dateCol: undefined,
      descriptionCol: undefined,
      amountCol: undefined,
      debitCol: undefined,
      creditCol: undefined,
      useDebitCredit: false
    }
  );
  const [accountId, setAccountId] = useState<string | null>(initialAccountId ?? null);
  const [chosenPositiveAmountType, setChosenPositiveAmountType] = useState<TransactionType | undefined>();

  function set(field: keyof MappingState, value: string | boolean | undefined) {
    setMapping((prev) => ({ ...prev, [field]: value }));
  }

  // A single Amount column needs to know what a positive number means. The
  // account remembers that after its first upload; until then we ask here.
  const account = accounts.find((a) => a.id === accountId);
  const needsSignConvention = !mapping.useDebitCredit && Boolean(account);
  const positiveAmountType = needsSignConvention
    ? (account?.positiveAmountType ?? chosenPositiveAmountType)
    : undefined;

  const amountValid = mapping.useDebitCredit ? mapping.debitCol && mapping.creditCol : mapping.amountCol;
  const isValid = Boolean(
    mapping.dateCol &&
    mapping.descriptionCol &&
    amountValid &&
    accountId &&
    (!needsSignConvention || positiveAmountType)
  );

  // Columns to show in preview: only mapped ones
  const previewCols: Array<{ field: string; col: string }> = [
    mapping.dateCol ? { field: "Date", col: mapping.dateCol } : null,
    mapping.descriptionCol ? { field: "Description", col: mapping.descriptionCol } : null,
    mapping.useDebitCredit && mapping.debitCol ? { field: "Debit", col: mapping.debitCol } : null,
    mapping.useDebitCredit && mapping.creditCol ? { field: "Credit", col: mapping.creditCol } : null,
    !mapping.useDebitCredit && mapping.amountCol ? { field: "Amount", col: mapping.amountCol } : null
  ].filter(Boolean) as Array<{ field: string; col: string }>;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-medium">
        Map columns for <span className="font-mono">{fileName}</span>
      </p>

      {initialMapping && (
        <p className="text-muted-foreground text-xs">
          Columns auto-filled from a previous upload — pick an account and confirm.
        </p>
      )}

      {/* Account */}
      <div className="flex flex-col gap-1 max-w-xs">
        <label className="text-xs font-medium text-muted-foreground">Account</label>
        <AccountSelector value={accountId} onChange={setAccountId} accounts={accounts} />
      </div>

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

      {/* Sign convention — asked once per account */}
      {needsSignConvention &&
        (account?.positiveAmountType ? (
          <p className="text-muted-foreground text-xs">
            Positive amounts on {account.name} are read as{" "}
            {POSITIVE_AMOUNT_LABELS[account.positiveAmountType].toLowerCase()}.
          </p>
        ) : (
          <div className="flex max-w-xs flex-col gap-1">
            <label htmlFor="positive-amounts" className="text-xs font-medium text-muted-foreground">
              Positive amounts are
            </label>
            <select
              id="positive-amounts"
              aria-label="Positive amounts are"
              value={chosenPositiveAmountType ?? ""}
              onChange={(e) =>
                setChosenPositiveAmountType((e.target.value || undefined) as TransactionType | undefined)
              }
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            >
              <option value="">— select —</option>
              <option value="DEBIT">{POSITIVE_AMOUNT_LABELS.DEBIT}</option>
              <option value="CREDIT">{POSITIVE_AMOUNT_LABELS.CREDIT}</option>
            </select>
            <p className="text-muted-foreground text-xs">
              Asked once — saved on {account?.name} for every later statement from this account.
            </p>
          </div>
        ))}

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
                {previewCols.map(({ field, col }) => {
                  const colIndex = headers.indexOf(col);
                  const raw = row[colIndex] ?? "";
                  if (field === "Date") {
                    const normalized = normalizeDate(raw);
                    return (
                      <TableCell key={col}>
                        {normalized ?? (
                          <span className="text-destructive" title={`Cannot parse: "${raw}"`}>
                            {raw}
                          </span>
                        )}
                      </TableCell>
                    );
                  }
                  return <TableCell key={col}>{raw}</TableCell>;
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button disabled={!isValid} onClick={() => onConfirm(mapping, accountId!, positiveAmountType)}>
          Confirm mapping
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
