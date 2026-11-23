import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_PRESET_COLORS } from "@/lib/color";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

import type { Category, CategoryGroup } from "@pnl/types";

export const CATEGORY_GROUPS = ["INCOME", "FIXED", "VARIABLE", "IGNORED"] as const satisfies readonly CategoryGroup[];

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  INCOME: "Income",
  FIXED: "Fixed",
  VARIABLE: "Variable",
  IGNORED: "Ignored"
};

const GROUP_DESCRIPTIONS: Record<CategoryGroup, string> = {
  INCOME: "Money coming in.",
  FIXED: "Recurring costs that rarely change.",
  VARIABLE: "Day-to-day spending.",
  IGNORED: "Transfers and card payments, left out of the P&L."
};

const NAME_MAX = 64;

/** Which side of the P&L a Group's Transactions land on — used to explain a Group move. */
function pnlSide(group: CategoryGroup): string {
  if (group === "INCOME") return "Income";
  if (group === "IGNORED") return "Ignored (left out of the P&L)";
  return "Expenses";
}

export function groupMoveNote(from: CategoryGroup, to: CategoryGroup): string | null {
  if (from === to) return null;
  if (pnlSide(from) === pnlSide(to)) {
    return `Its transactions will move from ${GROUP_LABELS[from]} to ${GROUP_LABELS[to]} expenses in the P&L.`;
  }
  return `Its transactions will move to the other side of the P&L: ${pnlSide(from)} → ${pnlSide(to)}.`;
}

function errorCode(err: unknown): string | undefined {
  return (err as { data?: { code?: string } } | null)?.data?.code;
}

/** Invalidate everything a category change can affect: pickers, transaction lists, P&L and tag reports. */
function useInvalidateAfterCategoryChange() {
  const utils = trpc.useUtils();
  return () =>
    Promise.all([
      utils.categories.list.invalidate(),
      utils.transactions.invalidate(),
      utils.pnl.invalidate(),
      utils.tags.invalidate()
    ]);
}

// ---------------------------------------------------------------------------
// Color swatches
// ---------------------------------------------------------------------------

function ColorField({ value, onChange }: { value: string | null; onChange: (hex: string | null) => void }) {
  const labelId = useId();
  return (
    <div className="space-y-1.5">
      <span id={labelId} className="text-xs font-medium text-muted-foreground">
        Color (optional)
      </span>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="No color"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={cn(
            "flex h-6 items-center rounded-full border px-2 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === null && "border-foreground text-foreground"
          )}
        >
          None
        </button>
        {TAG_PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={value?.toLowerCase() === c}
            onClick={() => onChange(c)}
            className={cn(
              "size-6 rounded-full border-2 border-transparent outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              value?.toLowerCase() === c && "border-foreground"
            )}
            style={{ background: c }}
          />
        ))}
        <input
          type="color"
          aria-label="Custom color"
          title="Custom color"
          value={value ?? "#888888"}
          onChange={(e) => onChange(e.target.value)}
          className="size-6 cursor-pointer rounded border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

type FormState = { name: string; groupType: CategoryGroup; color: string | null };

type CategoryFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Category being edited; omitted when creating. */
  category?: Category;
  /** Group preselected when creating. */
  defaultGroup?: CategoryGroup;
};

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  defaultGroup = "VARIABLE"
}: CategoryFormDialogProps) {
  const isEdit = category !== undefined;
  const nameId = useId();
  const nameErrorId = useId();
  const groupId = useId();
  const [form, setForm] = useState<FormState>(() => initialForm(category, defaultGroup));
  const [nameError, setNameError] = useState<string | null>(null);
  const invalidate = useInvalidateAfterCategoryChange();

  // Reset the form each time the dialog opens, so a cancelled edit doesn't leak into the next one.
  useEffect(() => {
    if (open) {
      setForm(initialForm(category, defaultGroup));
      setNameError(null);
    }
  }, [open, category, defaultGroup]);

  const onError = (err: unknown) => {
    if (errorCode(err) === "CONFLICT") {
      setNameError(`A category named "${form.name.trim()}" already exists.`);
      return;
    }
    if (errorCode(err) === "NOT_FOUND") {
      toast.error("That category no longer exists");
      onOpenChange(false);
      void invalidate();
      return;
    }
    toast.error(isEdit ? "Failed to update category" : "Failed to create category");
  };

  const createMutation = trpc.categories.create.useMutation({
    onError,
    onSuccess: (created) => {
      toast(`Category "${created.name}" created`);
      onOpenChange(false);
      void invalidate();
    }
  });

  const updateMutation = trpc.categories.update.useMutation({
    onError,
    onSuccess: (updated) => {
      toast(`Category "${updated.name}" updated`);
      onOpenChange(false);
      void invalidate();
    }
  });

  const pending = createMutation.isPending || updateMutation.isPending;
  const moveNote = isEdit ? groupMoveNote(category.groupType, form.groupType) : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (name.length === 0) {
      setNameError("Name is required.");
      return;
    }
    if (name.length > NAME_MAX) {
      setNameError(`Name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    setNameError(null);

    if (!isEdit) {
      createMutation.mutate({ name, groupType: form.groupType, color: form.color });
      return;
    }
    // Send only what changed so an untouched field never races another edit.
    updateMutation.mutate({
      id: category.id,
      ...(name !== category.name && { name }),
      ...(form.groupType !== category.groupType && { groupType: form.groupType }),
      ...(form.color !== category.color && { color: form.color })
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "Rename it, change its color, or move it to another group." : "Add a category of your own."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={nameId} className="text-xs text-muted-foreground">
              Name
            </Label>
            <Input
              id={nameId}
              autoFocus
              value={form.name}
              maxLength={NAME_MAX}
              placeholder="Groceries"
              aria-invalid={nameError !== null}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
                if (nameError) setNameError(null);
              }}
            />
            {nameError && (
              <p id={nameErrorId} role="alert" className="text-xs text-destructive">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={groupId} className="text-xs text-muted-foreground">
              Group
            </Label>
            <Select
              value={form.groupType}
              onValueChange={(v) => setForm((f) => ({ ...f, groupType: v as CategoryGroup }))}
            >
              <SelectTrigger id={groupId} className="w-full" aria-label="Group">
                <SelectValue>{(v: string) => GROUP_LABELS[v as CategoryGroup] ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GROUP_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {moveNote && (
              <p role="note" className="text-xs text-amber-600 dark:text-amber-400">
                {moveNote}
              </p>
            )}
          </div>

          <ColorField value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} />

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initialForm(category: Category | undefined, defaultGroup: CategoryGroup): FormState {
  return category
    ? { name: category.name, groupType: category.groupType, color: category.color }
    : { name: "", groupType: defaultGroup, color: null };
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

type DeleteCategoryDialogProps = {
  category: Category | null;
  onOpenChange: (open: boolean) => void;
};

export function DeleteCategoryDialog({ category: target, onOpenChange }: DeleteCategoryDialogProps) {
  // Keep showing the last target while the dialog animates closed.
  const [category, setCategory] = useState<Category | null>(target);
  useEffect(() => {
    if (target) setCategory(target);
  }, [target]);
  const open = target !== null;
  const invalidate = useInvalidateAfterCategoryChange();
  // `total` ignores limit/offset, so one row is enough to learn how many Transactions are filed here.
  const countQuery = trpc.transactions.list.useQuery(
    { categoryId: category?.id ?? -1, limit: 1, offset: 0 },
    { enabled: open, staleTime: 0 }
  );
  const count = countQuery.data?.total;

  const deleteMutation = trpc.categories.delete.useMutation({
    onError: (err) => {
      if (errorCode(err) === "NOT_FOUND") {
        toast.error("That category no longer exists");
        onOpenChange(false);
      } else {
        toast.error("Failed to delete category");
      }
      void invalidate();
    },
    onSuccess: ({ uncategorizedCount }) => {
      toast(
        uncategorizedCount === 0
          ? `Category "${category?.name}" deleted`
          : `Category "${category?.name}" deleted — ${pluralTransactions(uncategorizedCount)} now uncategorized`
      );
      onOpenChange(false);
      void invalidate();
    }
  });

  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{category?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {count === undefined ? (
              countQuery.isError ? (
                "Its transactions will become uncategorized."
              ) : (
                "Counting transactions…"
              )
            ) : count === 0 ? (
              "No transactions use this category."
            ) : (
              <>
                <strong className="text-foreground">{pluralTransactions(count)}</strong> will become uncategorized.
              </>
            )}
            {category?.isDefault && " This is a default category; re-running the seed will add it back."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={deleteMutation.isPending || !open}
            onClick={() => category && deleteMutation.mutate({ id: category.id })}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function pluralTransactions(n: number): string {
  return `${n} ${n === 1 ? "transaction" : "transactions"}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function CategoryRow({
  category,
  onEdit,
  onDelete
}: {
  category: Category;
  onEdit: (c: Category) => void;
  onDelete: (c: Category) => void;
}) {
  return (
    <li className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/40">
      <span
        aria-hidden
        className={cn(
          "size-3 shrink-0 rounded-full",
          !category.color && "border border-dashed border-muted-foreground"
        )}
        style={category.color ? { background: category.color } : undefined}
      />
      <span className="min-w-0 flex-1 truncate text-sm">{category.name}</span>
      <Badge variant={category.isDefault ? "outline" : "secondary"} className="text-xs">
        {category.isDefault ? "Default" : "Custom"}
      </Badge>
      <div className="flex gap-1">
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${category.name}`} onClick={() => onEdit(category)}>
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete ${category.name}`}
          className="text-destructive hover:text-destructive"
          onClick={() => onDelete(category)}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

type FormTarget = { mode: "create"; group: CategoryGroup } | { mode: "edit"; category: Category };

export function CategoriesPage() {
  const { data, isLoading } = trpc.categories.list.useQuery();
  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  // Keep the last target while the dialog animates closed so its contents don't flash empty.
  const [lastFormTarget, setLastFormTarget] = useState<FormTarget>({ mode: "create", group: "VARIABLE" });
  const [deleting, setDeleting] = useState<Category | null>(null);

  function openForm(target: FormTarget) {
    setLastFormTarget(target);
    setFormTarget(target);
  }

  // "n" opens the create dialog from anywhere on the page, unless the user is typing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (formTarget !== null || deleting !== null) return;
      e.preventDefault();
      openForm({ mode: "create", group: "VARIABLE" });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [formTarget, deleting]);

  const shown = formTarget ?? lastFormTarget;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Categories</h1>
          <p className="text-muted-foreground">
            Each category&apos;s group decides which side of the P&amp;L its transactions land on.
          </p>
        </div>
        <Button size="sm" onClick={() => openForm({ mode: "create", group: "VARIABLE" })}>
          <PlusIcon className="mr-1.5 size-4" />
          New category
          <kbd className="ml-2 rounded border px-1 text-[0.65rem] text-muted-foreground">N</kbd>
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          {CATEGORY_GROUPS.map((g) => (
            <Skeleton key={g} data-testid="category-group-skeleton" className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        CATEGORY_GROUPS.map((group) => {
          const items = data[group];
          const headingId = `category-group-${group}`;
          return (
            <section key={group} aria-labelledby={headingId}>
              <Card className="gap-0 py-0">
                <CardHeader className="flex flex-row items-center justify-between border-b py-3">
                  <div>
                    <CardTitle id={headingId}>
                      {GROUP_LABELS[group]}{" "}
                      <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{GROUP_DESCRIPTIONS[group]}</p>
                  </div>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Add a category to ${GROUP_LABELS[group]}`}
                    onClick={() => openForm({ mode: "create", group })}
                  >
                    <PlusIcon className="size-3.5" />
                    Add
                  </Button>
                </CardHeader>
                <CardContent className="px-0">
                  {items.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No categories in this group.</p>
                  ) : (
                    <ul className="divide-y">
                      {items.map((category) => (
                        <CategoryRow
                          key={category.id}
                          category={category}
                          onEdit={(c) => openForm({ mode: "edit", category: c })}
                          onDelete={setDeleting}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </section>
          );
        })
      )}

      <CategoryFormDialog
        open={formTarget !== null}
        onOpenChange={(open) => !open && setFormTarget(null)}
        category={shown.mode === "edit" ? shown.category : undefined}
        defaultGroup={shown.mode === "create" ? shown.group : undefined}
      />
      <DeleteCategoryDialog category={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </main>
  );
}
