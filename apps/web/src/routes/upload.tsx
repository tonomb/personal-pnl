import { Link, createFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ColumnMapper, type MappingState } from "@/components/upload/ColumnMapper";
import { DropZone } from "@/components/upload/DropZone";
import { RawPreviewPanel } from "@/components/upload/RawPreviewPanel";
import { SheetSelector } from "@/components/upload/SheetSelector";
import { generateFingerprint, generateTransactionId, normalizeDate, parseAmount, parseDebitCredit } from "@/lib/csv";
import { getSheetNames, xlsxToCsvString } from "@/lib/xlsx";
import { trpc } from "@/lib/trpc";

import type { NewColumnMapping, NewTransaction } from "@pnl/types";

export const Route = createFileRoute("/upload")({
  component: UploadPage
});

// ---------------------------------------------------------------------------
// File status discriminated union
// ---------------------------------------------------------------------------

type FileStatus =
  | { phase: "parsing" }
  | {
      phase: "mapping";
      headers: string[];
      rawRows: Array<Record<string, string>>;
      fingerprint: string;
      suggestedMapping?: MappingState;
    }
  | { phase: "ready"; transactions: NewTransaction[]; mapping: NewColumnMapping; accountId: string }
  | { phase: "uploading" }
  | { phase: "done"; inserted: number; duplicates: number }
  | { phase: "error"; message: string };

const BADGE_LABELS: Record<FileStatus["phase"], string> = {
  parsing: "Parsing…",
  mapping: "Needs mapping",
  ready: "Ready",
  uploading: "Uploading…",
  done: "Done",
  error: "Error"
};

const BADGE_VARIANTS: Record<FileStatus["phase"], "default" | "secondary" | "destructive" | "outline"> = {
  parsing: "secondary",
  mapping: "outline",
  ready: "default",
  uploading: "secondary",
  done: "default",
  error: "destructive"
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTransactions(
  rawRows: Array<Record<string, string>>,
  mapping: MappingState,
  sourceFile: string,
  accountId: string
): { transactions: NewTransaction[]; badDateRows: string[] } {
  const seen = new Set<string>();
  const result: NewTransaction[] = [];
  const badDateRows: string[] = [];

  for (const row of rawRows) {
    const rawDate = (row[mapping.dateCol!] ?? "").trim();
    const description = (row[mapping.descriptionCol!] ?? "").trim();
    if (!rawDate || !description) continue;

    const date = normalizeDate(rawDate);
    if (!date) {
      badDateRows.push(rawDate);
      continue;
    }

    let amount: number;
    let type: "DEBIT" | "CREDIT";

    if (mapping.useDebitCredit) {
      const parsed = parseDebitCredit(row[mapping.debitCol!] ?? "", row[mapping.creditCol!] ?? "");
      if (!parsed) continue;
      amount = parsed.amount;
      type = parsed.type;
    } else {
      const parsed = parseAmount(row[mapping.amountCol!] ?? "0");
      amount = parsed.amount;
      type = parsed.type;
    }

    const id = generateTransactionId(date, description, amount);
    if (seen.has(id)) continue;
    seen.add(id);

    result.push({
      id,
      date,
      description,
      amount,
      type,
      accountId,
      sourceFile,
      rawRow: JSON.stringify(row),
      createdAt: new Date().toISOString()
    });
  }

  return { transactions: result, badDateRows };
}

function toDbMapping(mapping: MappingState, fingerprint: string): NewColumnMapping {
  return {
    fileFingerprint: fingerprint,
    dateCol: mapping.dateCol!,
    descriptionCol: mapping.descriptionCol!,
    amountCol: mapping.amountCol ?? null,
    debitCol: mapping.debitCol ?? null,
    creditCol: mapping.creditCol ?? null
  };
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function UploadPage() {
  const [fileMap, setFileMap] = useState<Map<string, FileStatus>>(new Map());
  const [sheetPicker, setSheetPicker] = useState<{ file: File; sheetNames: string[] } | null>(null);
  const [lastUsedAccountId, setLastUsedAccountId] = useState<string | null>(null);
  const uploadMutation = trpc.transactions.upload.useMutation();
  const getMappingUtils = trpc.useUtils();
  const { data: accountsData } = trpc.accounts.list.useQuery();
  const allAccounts = accountsData ?? [];

  function updateFile(name: string, status: FileStatus | undefined) {
    setFileMap((prev) => {
      const next = new Map(prev);
      if (status === undefined) {
        next.delete(name);
      } else {
        next.set(name, status);
      }
      return next;
    });
  }

  async function applyParsedRows(file: File, data: Array<Record<string, string>>, headers: string[]) {
    const fingerprint = generateFingerprint(headers);

    let existing = null;
    try {
      existing = await getMappingUtils.transactions.getMapping.fetch({ fingerprint }, { staleTime: 0 });
    } catch {
      // worker not reachable — treat as unknown fingerprint
    }

    const suggestedMapping: MappingState | undefined = existing
      ? {
          dateCol: existing.dateCol,
          descriptionCol: existing.descriptionCol,
          amountCol: existing.amountCol ?? undefined,
          debitCol: existing.debitCol ?? undefined,
          creditCol: existing.creditCol ?? undefined,
          useDebitCredit: Boolean(existing.debitCol && existing.creditCol)
        }
      : undefined;

    updateFile(file.name, { phase: "mapping", headers, rawRows: data, fingerprint, suggestedMapping });
  }

  async function parseCsvAndContinue(csvStringOrFile: string | File, file: File) {
    let parsed: { data: Array<Record<string, string>>; headers: string[] };
    try {
      parsed = await new Promise((resolve, reject) => {
        Papa.parse<Record<string, string>>(csvStringOrFile as string, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data, meta }) => resolve({ data, headers: meta.fields ?? [] }),
          error: reject
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse";
      updateFile(file.name, { phase: "error", message });
      toast.error(`"${file.name}": ${message}`);
      return;
    }
    await applyParsedRows(file, parsed.data, parsed.headers);
  }

  async function processFile(file: File) {
    updateFile(file.name, { phase: "parsing" });

    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read file";
        updateFile(file.name, { phase: "error", message });
        toast.error(`"${file.name}": ${message}`);
        return;
      }

      let sheetNames: string[];
      try {
        sheetNames = getSheetNames(buffer);
      } catch {
        const message = "Could not read Excel file. It may be malformed or password-protected.";
        updateFile(file.name, { phase: "error", message });
        toast.error(`"${file.name}": ${message}`);
        return;
      }

      if (sheetNames.length === 0) {
        const message = "The Excel file contains no sheets.";
        updateFile(file.name, { phase: "error", message });
        toast.error(`"${file.name}": ${message}`);
        return;
      }

      // Always show SheetSelector so the user can set the header row
      setSheetPicker({ file, sheetNames });
      return;
    } else {
      await parseCsvAndContinue(file, file);
    }
  }

  async function handleSheetSelect(sheetName: string, headerRow: number) {
    if (!sheetPicker) return;
    const { file } = sheetPicker;
    setSheetPicker(null);

    let buffer: ArrayBuffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not read file";
      updateFile(file.name, { phase: "error", message });
      toast.error(`"${file.name}": ${message}`);
      return;
    }

    let csvString: string;
    try {
      csvString = xlsxToCsvString(buffer, sheetName, headerRow);
    } catch {
      const message = "Could not read Excel file. It may be malformed or password-protected.";
      updateFile(file.name, { phase: "error", message });
      toast.error(`"${file.name}": ${message}`);
      return;
    }

    await parseCsvAndContinue(csvString, file);
  }

  async function handleFiles(dropped: File[]) {
    for (const file of dropped) {
      await processFile(file);
    }
  }

  function handleMappingConfirm(fileName: string, mapping: MappingState, accountId: string) {
    const status = fileMap.get(fileName);
    if (status?.phase !== "mapping") return;

    const { transactions: txs, badDateRows } = buildTransactions(status.rawRows, mapping, fileName, accountId);
    const dbMapping = toDbMapping(mapping, status.fingerprint);
    updateFile(fileName, { phase: "ready", transactions: txs, mapping: dbMapping, accountId });
    setLastUsedAccountId(accountId);
    if (badDateRows.length > 0) {
      toast.warning(
        `${badDateRows.length} row(s) skipped — unrecognized date format: ${badDateRows.slice(0, 3).join(", ")}${badDateRows.length > 3 ? "…" : ""}`
      );
    }
  }

  async function handleUploadAll() {
    for (const [fileName, status] of fileMap.entries()) {
      if (status.phase !== "ready") continue;
      updateFile(fileName, { phase: "uploading" });
      try {
        const result = await uploadMutation.mutateAsync({
          transactions: status.transactions,
          sourceFile: fileName,
          mapping: status.mapping,
          accountId: status.accountId
        });
        updateFile(fileName, {
          phase: "done",
          inserted: result.inserted,
          duplicates: result.duplicates
        });
        toast(`"${fileName}": inserted ${result.inserted}, skipped ${result.duplicates} duplicates`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        updateFile(fileName, { phase: "error", message });
        toast.error(`"${fileName}": ${message}`);
      }
    }
  }

  const hasReady = [...fileMap.values()].some((s) => s.phase === "ready");

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">Upload</h1>
        <p className="text-muted-foreground">Upload one or more bank statement CSV or XLSX files.</p>
      </div>

      {allAccounts.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No accounts configured.{" "}
          <Link to="/accounts" className="underline hover:text-foreground">
            Add one first →
          </Link>{" "}
          — you can still upload files, but you'll need an account before you can confirm mapping.
        </p>
      )}

      <DropZone onFiles={handleFiles} />

      {sheetPicker && (
        <SheetSelector
          sheetNames={sheetPicker.sheetNames}
          onSelect={handleSheetSelect}
          onCancel={() => {
            updateFile(sheetPicker.file.name, undefined);
            setSheetPicker(null);
          }}
        />
      )}

      {fileMap.size > 0 && (
        <ul className="space-y-4" aria-live="polite" aria-label="File upload status">
          {[...fileMap.entries()].map(([name, status]) => (
            <li key={name} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{name}</span>
                <Badge variant={BADGE_VARIANTS[status.phase]}>{BADGE_LABELS[status.phase]}</Badge>
                {status.phase === "done" && (
                  <span className="text-muted-foreground text-xs">
                    {status.inserted} inserted · {status.duplicates} duplicates
                  </span>
                )}
                {status.phase === "error" && <span className="text-destructive text-xs">{status.message}</span>}
              </div>

              {status.phase === "mapping" && (
                <>
                  <RawPreviewPanel headers={status.headers} rawRows={status.rawRows} />
                  <ColumnMapper
                    fileName={name}
                    headers={status.headers}
                    previewRows={status.rawRows.slice(0, 5).map((row) => status.headers.map((h) => row[h] ?? ""))}
                    accounts={allAccounts}
                    initialAccountId={lastUsedAccountId}
                    initialMapping={status.suggestedMapping}
                    onConfirm={(mapping, accountId) => handleMappingConfirm(name, mapping, accountId)}
                    onCancel={() => updateFile(name, undefined)}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasReady && (
        <Button onClick={handleUploadAll} disabled={uploadMutation.isPending}>
          Upload All
        </Button>
      )}
    </main>
  );
}
