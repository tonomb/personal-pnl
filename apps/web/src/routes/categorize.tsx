import { createFileRoute, Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRightIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { TagFilterSelect } from "@/components/tags/TagFilterSelect";
import { TagPicker } from "@/components/tags/TagPicker";
import { TagPill } from "@/components/tags/TagPill";
import { getContrastColor } from "@/lib/color";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

import type { Category, Tag, TransactionWithCategory } from "@pnl/types";

export const Route = createFileRoute("/categorize")({
  component: CategorizePage
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Filters = {
  month: string | undefined;
  uncategorizedOnly: boolean;
  search: string;
  tagId: string | undefined;
};

type MerchantRow = {
  kind: "merchant-header";
  merchantKey: string;
  txIds: string[];
  displayName: string;
  totalDebits: number;
  totalCredits: number;
};

type TxRow = {
  kind: "transaction";
  tx: TransactionWithCategory;
};

type FlatRow = MerchantRow | TxRow;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GRID =
  "grid-cols-[20px_minmax(0,1fr)_96px_minmax(160px,260px)] sm:grid-cols-[20px_minmax(0,1fr)_80px_100px_minmax(220px,1fr)]";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(y!, m! - 1, d!));
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(y!, m! - 1, 1));
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function ProgressHeader({ categorized, total }: { categorized: number; total: number }) {
  const pct = total > 0 ? Math.round((categorized / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Categorized</span>
        <span className="tabular-nums text-muted-foreground">
          {categorized} / {total} ({pct}%)
        </span>
      </div>
      <Progress value={pct} />
    </div>
  );
}

function FilterBar({
  filters,
  availableMonths,
  tags,
  onChange
}: {
  filters: Filters;
  availableMonths: string[];
  tags: Tag[];
  onChange: (f: Filters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filters.month ?? ""}
        onValueChange={(val) => onChange({ ...filters, month: (val as string) || undefined })}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All months" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All months</SelectItem>
          {availableMonths.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant={filters.uncategorizedOnly ? "default" : "outline"}
        size="sm"
        onClick={() => onChange({ ...filters, uncategorizedOnly: !filters.uncategorizedOnly })}
      >
        Uncategorized only
      </Button>

      <TagFilterSelect tags={tags} value={filters.tagId} onChange={(tagId) => onChange({ ...filters, tagId })} />

      <div className="relative min-w-48 flex-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search descriptions…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: (e.target as HTMLInputElement).value })}
          className="pl-8"
        />
      </div>
    </div>
  );
}

function BulkAssignBar({
  selectedCount,
  catData,
  tags,
  value,
  onValueChange,
  onApply,
  onAssignTag,
  onCreateTag,
  onClear,
  isPending
}: {
  selectedCount: number;
  catData: { INCOME: Category[]; FIXED: Category[]; VARIABLE: Category[]; IGNORED: Category[] } | undefined;
  tags: Tag[];
  value: string;
  onValueChange: (v: string) => void;
  onApply: () => void;
  onAssignTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
  onClear: () => void;
  isPending: boolean;
}) {
  const GROUPS = ["INCOME", "FIXED", "VARIABLE", "IGNORED"] as const;

  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="shrink-0 text-sm text-muted-foreground">{selectedCount} selected</span>
      <Select value={value} onValueChange={(v) => onValueChange(v as string)}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Choose category…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__null__">None (remove category)</SelectItem>
          {GROUPS.map((group) => {
            const cats = catData?.[group] ?? [];
            if (cats.length === 0) return null;
            return (
              <SelectGroup key={group}>
                <SelectLabel>{group.charAt(0) + group.slice(1).toLowerCase()}</SelectLabel>
                {cats.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={onApply} disabled={!value || isPending}>
        Apply
      </Button>
      <TagPicker
        tags={tags}
        selectedTagIds={EMPTY_TAG_ID_SET}
        onAssign={onAssignTag}
        onCreate={onCreateTag}
        trigger={
          <Button variant="outline" size="sm">
            <PlusIcon /> Add tag
          </Button>
        }
      />
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

const EMPTY_TAG_ID_SET: ReadonlySet<string> = new Set();

function MerchantHeaderRow({
  row,
  isCursor,
  isExpanded,
  isAllSelected,
  isSomeSelected,
  onToggle,
  onSelectAll
}: {
  row: MerchantRow;
  isCursor: boolean;
  isExpanded: boolean;
  isAllSelected: boolean;
  isSomeSelected: boolean;
  onToggle: () => void;
  onSelectAll: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={isAllSelected || isSomeSelected}
      aria-expanded={isExpanded}
      className={cn(
        "grid h-12 items-center border-b bg-muted/40 px-3",
        GRID,
        isCursor && "ring-1 ring-inset ring-ring"
      )}
    >
      <Checkbox
        checked={isAllSelected}
        indeterminate={isSomeSelected}
        onCheckedChange={onSelectAll}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      />
      <button className="flex items-center gap-1.5 truncate text-left text-sm font-medium" onClick={onToggle}>
        <ChevronRightIcon
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")}
        />
        <span className="truncate">{row.displayName}</span>
        <Badge variant="secondary" className="shrink-0">
          {row.txIds.length}
        </Badge>
      </button>
      <span />
      <span className="text-right text-xs tabular-nums">
        {row.totalDebits > 0 && <span className="block text-destructive">-{formatCurrency(row.totalDebits)}</span>}
        {row.totalCredits > 0 && <span className="block text-income">+{formatCurrency(row.totalCredits)}</span>}
      </span>
      <span className="hidden sm:block" />
    </div>
  );
}

function TransactionRow({
  tx,
  isCursor,
  isSelected,
  tags,
  onToggle,
  onAssignTag,
  onRemoveTag,
  onCreateTag
}: {
  tx: TransactionWithCategory;
  isCursor: boolean;
  isSelected: boolean;
  tags: Tag[];
  onToggle: () => void;
  onAssignTag: (tagId: string) => void;
  onRemoveTag: (tagId: string) => void;
  onCreateTag: (name: string, color: string) => Promise<Tag>;
}) {
  const rowTagIds = useMemo(() => new Set(tx.tags.map((t) => t.id)), [tx.tags]);
  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={cn(
        "grid h-12 items-center border-b px-3",
        GRID,
        isSelected && "bg-accent/40",
        isCursor && "ring-1 ring-inset ring-ring"
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      />
      <span className="truncate pl-6 text-sm">{tx.description}</span>
      <span className="hidden text-xs text-muted-foreground sm:block">{formatDate(tx.date)}</span>
      <span className={cn("text-right text-sm tabular-nums", tx.type === "DEBIT" ? "text-destructive" : "text-income")}>
        {tx.type === "DEBIT" ? "-" : "+"}
        {formatCurrency(tx.amount)}
      </span>
      <span className="hidden min-w-0 items-center gap-1.5 overflow-hidden sm:flex">
        {tx.categoryId != null ? (
          <Badge
            variant="secondary"
            className="shrink-0"
            style={
              tx.categoryColor
                ? { backgroundColor: tx.categoryColor, color: getContrastColor(tx.categoryColor) }
                : undefined
            }
          >
            {tx.categoryName}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">
            Uncategorized
          </Badge>
        )}
        <span className="flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto">
          {tx.tags.map((tag) => (
            <TagPill key={tag.id} tag={tag} onRemove={() => onRemoveTag(tag.id)} />
          ))}
        </span>
        <TagPicker
          tags={tags}
          selectedTagIds={rowTagIds}
          onAssign={onAssignTag}
          onCreate={onCreateTag}
          align="end"
          trigger={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add tag"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <PlusIcon />
            </Button>
          }
        />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function CategorizePage() {
  const [filters, setFilters] = useState<Filters>({
    month: undefined,
    uncategorizedOnly: false,
    search: "",
    tagId: undefined
  });
  const [expandedMerchants, setExpandedMerchants] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [cursorIndex, setCursorIndex] = useState(0);

  const parentRef = useRef<HTMLDivElement>(null);

  const { data: txResult } = trpc.transactions.list.useQuery({});
  const txData = txResult?.rows ?? [];
  const { data: catData } = trpc.categories.list.useQuery();
  const { data: tagData } = trpc.tags.list.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const tags = useMemo<Tag[]>(
    () => (tagData ?? []).map(({ id, name, color, createdAt }) => ({ id, name, color, createdAt })),
    [tagData]
  );
  const utils = trpc.useUtils();

  const allCategories = useMemo(
    () => [
      ...(catData?.INCOME ?? []),
      ...(catData?.FIXED ?? []),
      ...(catData?.VARIABLE ?? []),
      ...(catData?.IGNORED ?? [])
    ],
    [catData]
  );

  const categorizeMutation = trpc.transactions.categorize.useMutation({
    onMutate: async ({ ids, categoryId }) => {
      await utils.transactions.list.cancel();
      const snapshot = utils.transactions.list.getData({});
      const match = categoryId != null ? allCategories.find((c) => c.id === categoryId) : null;
      utils.transactions.list.setData({}, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((tx) =>
                ids.includes(tx.id)
                  ? {
                      ...tx,
                      categoryId,
                      categoryName: match?.name ?? null,
                      categoryGroupType: match?.groupType ?? null,
                      categoryColor: match?.color ?? null
                    }
                  : tx
              )
            }
          : old
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.transactions.list.setData({}, ctx?.snapshot);
      toast.error("Failed to assign category");
    },
    onSettled: () => {
      void utils.transactions.list.invalidate();
      clearSelection();
    }
  });

  const assignTagMutation = trpc.tags.assignToTransactions.useMutation({
    onMutate: async ({ tagId, transactionIds }) => {
      await utils.transactions.list.cancel();
      const snapshot = utils.transactions.list.getData({});
      const tag = tags.find((t) => t.id === tagId);
      if (!tag) return { snapshot };
      const idSet = new Set(transactionIds);
      utils.transactions.list.setData({}, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((tx) =>
                idSet.has(tx.id) && !tx.tags.some((t) => t.id === tagId) ? { ...tx, tags: [...tx.tags, tag] } : tx
              )
            }
          : old
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.transactions.list.setData({}, ctx?.snapshot);
      toast.error("Failed to add tag");
    },
    onSettled: () => {
      void utils.transactions.list.invalidate();
    }
  });

  const removeTagMutation = trpc.tags.removeFromTransactions.useMutation({
    onMutate: async ({ tagId, transactionIds }) => {
      await utils.transactions.list.cancel();
      const snapshot = utils.transactions.list.getData({});
      const idSet = new Set(transactionIds);
      utils.transactions.list.setData({}, (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((tx) =>
                idSet.has(tx.id) ? { ...tx, tags: tx.tags.filter((t) => t.id !== tagId) } : tx
              )
            }
          : old
      );
      return { snapshot };
    },
    onError: (_err, _input, ctx) => {
      utils.transactions.list.setData({}, ctx?.snapshot);
      toast.error("Failed to remove tag");
    },
    onSettled: () => {
      void utils.transactions.list.invalidate();
    }
  });

  const createTagMutation = trpc.tags.create.useMutation({
    onSuccess: (created) => {
      utils.tags.list.setData(undefined, (old) =>
        old
          ? old.some((t) => t.id === created.id)
            ? old
            : [...old, { ...created, transactionCount: 0 }]
          : [{ ...created, transactionCount: 0 }]
      );
      void utils.tags.list.invalidate();
    }
  });

  function handleAssignTagToRow(transactionId: string, tagId: string) {
    assignTagMutation.mutate({ tagId, transactionIds: [transactionId] });
  }

  function handleRemoveTagFromRow(transactionId: string, tagId: string) {
    removeTagMutation.mutate({ tagId, transactionIds: [transactionId] });
  }

  async function handleCreateTagAndAssign(transactionIds: string[], name: string, color: string): Promise<Tag> {
    const created = await createTagMutation.mutateAsync({ name, color });
    assignTagMutation.mutate({ tagId: created.id, transactionIds });
    return created;
  }

  function handleBulkAssignTag(tagId: string) {
    if (selectedIds.size === 0) return;
    assignTagMutation.mutate({ tagId, transactionIds: [...selectedIds] });
  }

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const tx of txData) months.add(tx.date.slice(0, 7));
    return [...months].sort().reverse();
  }, [txData]);

  const flatRows = useMemo<FlatRow[]>(() => {
    const filtered = txData.filter((tx) => {
      if (filters.month && !tx.date.startsWith(filters.month)) return false;
      if (filters.uncategorizedOnly && tx.categoryId != null) return false;
      if (filters.search && !tx.description.toUpperCase().includes(filters.search.toUpperCase())) return false;
      if (filters.tagId && !tx.tags.some((t) => t.id === filters.tagId)) return false;
      return true;
    });

    const groups = new Map<string, TransactionWithCategory[]>();
    for (const tx of filtered) {
      const key = tx.description.trim().toUpperCase();
      const arr = groups.get(key) ?? [];
      arr.push(tx);
      groups.set(key, arr);
    }

    const rows: FlatRow[] = [];
    for (const [key, txs] of groups) {
      const txIds = txs.map((t) => t.id);
      const totalDebits = txs.filter((t) => t.type === "DEBIT").reduce((s, t) => s + t.amount, 0);
      const totalCredits = txs.filter((t) => t.type === "CREDIT").reduce((s, t) => s + t.amount, 0);
      rows.push({
        kind: "merchant-header",
        merchantKey: key,
        txIds,
        displayName: txs[0]!.description.trim(),
        totalDebits,
        totalCredits
      });
      if (expandedMerchants.has(key)) {
        for (const tx of txs) rows.push({ kind: "transaction", tx });
      }
    }
    return rows;
  }, [txData, filters, expandedMerchants]);

  const categorizedCount = txData.filter((tx) => tx.categoryId != null).length;
  const allCategorized = txData.length > 0 && categorizedCount === txData.length;

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10
  });

  // Refs to avoid stale closures in the keydown handler
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const cursorIndexRef = useRef(cursorIndex);
  cursorIndexRef.current = cursorIndex;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;

      const rows = flatRowsRef.current;
      const idx = cursorIndexRef.current;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(idx + 1, rows.length - 1);
        setCursorIndex(next);
        rowVirtualizer.scrollToIndex(next);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(idx - 1, 0);
        setCursorIndex(prev);
        rowVirtualizer.scrollToIndex(prev);
      } else if (e.key === " ") {
        e.preventDefault();
        const row = rows[idx];
        if (!row) return;
        if (row.kind === "transaction") {
          toggleSelect(row.tx.id);
        } else {
          toggleExpand(row.merchantKey);
        }
      } else if (e.key === "Enter") {
        const ids = selectedIdsRef.current;
        if (ids.size > 0 && bulkCategoryId) {
          e.preventDefault();
          handleApplyBulk();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [rowVirtualizer, bulkCategoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleExpand(key: string) {
    setExpandedMerchants((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAllInMerchant(txIds: string[]) {
    const allSelected = txIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const id of txIds) next.delete(id);
      } else {
        for (const id of txIds) next.add(id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setBulkCategoryId("");
  }

  function handleApplyBulk() {
    if (!bulkCategoryId) return;
    const categoryId = bulkCategoryId === "__null__" ? null : parseInt(bulkCategoryId, 10);
    categorizeMutation.mutate({ ids: [...selectedIds], categoryId });
  }

  return (
    <main className="flex h-full flex-col">
      {/* Header */}
      <div className="space-y-3 border-b p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Categorize</h1>
          {allCategorized && (
            <Link to="/pnl" className="text-sm font-medium text-primary hover:underline">
              All done! View P&L →
            </Link>
          )}
        </div>
        <ProgressHeader categorized={categorizedCount} total={txData.length} />
        <FilterBar filters={filters} availableMonths={availableMonths} tags={tags} onChange={setFilters} />
        {selectedIds.size > 0 && (
          <BulkAssignBar
            selectedCount={selectedIds.size}
            catData={catData}
            tags={tags}
            value={bulkCategoryId}
            onValueChange={setBulkCategoryId}
            onApply={handleApplyBulk}
            onAssignTag={handleBulkAssignTag}
            onCreateTag={(name, color) => handleCreateTagAndAssign([...selectedIds], name, color)}
            onClear={clearSelection}
            isPending={categorizeMutation.isPending}
          />
        )}
      </div>

      {/* Column headers */}
      <div className={cn("grid border-b px-3 py-2 text-xs text-muted-foreground", GRID)}>
        <span />
        <span>Description</span>
        <span className="hidden sm:block">Date</span>
        <span className="text-right">Amount</span>
        <span className="hidden sm:block">Category &amp; tags</span>
      </div>

      {/* Virtual list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-y-auto"
        role="listbox"
        aria-label="Transactions"
        aria-activedescendant={flatRows.length > 0 ? `tx-row-${cursorIndex}` : undefined}
      >
        {flatRows.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {txData.length === 0 ? (
              <span>
                No statements uploaded yet.{" "}
                <Link to="/upload" className="text-primary hover:underline">
                  Upload one →
                </Link>
              </span>
            ) : (
              "Nothing matches your filters."
            )}
          </div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const row = flatRows[virtualItem.index]!;
              const isCursor = virtualItem.index === cursorIndex;
              return (
                <div
                  key={virtualItem.key}
                  id={`tx-row-${virtualItem.index}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${virtualItem.start}px)`,
                    height: `${virtualItem.size}px`
                  }}
                >
                  {row.kind === "merchant-header" ? (
                    <MerchantHeaderRow
                      row={row}
                      isCursor={isCursor}
                      isExpanded={expandedMerchants.has(row.merchantKey)}
                      isAllSelected={row.txIds.length > 0 && row.txIds.every((id) => selectedIds.has(id))}
                      isSomeSelected={
                        !row.txIds.every((id) => selectedIds.has(id)) && row.txIds.some((id) => selectedIds.has(id))
                      }
                      onToggle={() => toggleExpand(row.merchantKey)}
                      onSelectAll={() => selectAllInMerchant(row.txIds)}
                    />
                  ) : (
                    <TransactionRow
                      tx={row.tx}
                      isCursor={isCursor}
                      isSelected={selectedIds.has(row.tx.id)}
                      tags={tags}
                      onToggle={() => toggleSelect(row.tx.id)}
                      onAssignTag={(tagId) => handleAssignTagToRow(row.tx.id, tagId)}
                      onRemoveTag={(tagId) => handleRemoveTagFromRow(row.tx.id, tagId)}
                      onCreateTag={(name, color) => handleCreateTagAndAssign([row.tx.id], name, color)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
