import * as React from "react";
import { CheckIcon, PlusIcon, ArrowLeftIcon } from "lucide-react";

import type { Tag } from "@pnl/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_PRESET_COLORS } from "@/lib/color";
import { useListHighlight } from "@/lib/use-list-highlight";
import { cn } from "@/lib/utils";

type TagPickerProps = {
  tags: Tag[];
  selectedTagIds: ReadonlySet<string>;
  onAssign: (tagId: string) => void;
  onCreate: (name: string, color: string) => Promise<Tag>;
  /** Omit to drive the picker with `open` / `onOpenChange` and position it against `anchor`. */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  anchor?: Element | null;
  /**
   * Show error message inline (e.g. duplicate name conflict). Cleared by the
   * picker when the user edits the name input or reopens the popover.
   */
  align?: "start" | "center" | "end";
};

type View = "list" | "create";

export function TagPicker({
  tags,
  selectedTagIds,
  onAssign,
  onCreate,
  trigger,
  open: controlledOpen,
  onOpenChange,
  anchor,
  align = "start"
}: TagPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  }
  const [view, setView] = React.useState<View>("list");
  const [search, setSearch] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [newColor, setNewColor] = React.useState<string>(TAG_PRESET_COLORS[0]);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  // Reset internal state when popover closes.
  React.useEffect(() => {
    if (!open) {
      setView("list");
      setSearch("");
      setNewName("");
      setNewColor(TAG_PRESET_COLORS[0]);
      setCreateError(null);
      setCreating(false);
    }
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, search]);

  // Keyboard highlight runs over the assignable tags, then "Create new tag".
  const assignable = React.useMemo(() => filtered.filter((t) => !selectedTagIds.has(t.id)), [filtered, selectedTagIds]);
  const { index, move, listRef } = useListHighlight(assignable.length + 1, search);
  const highlightedTagId = assignable[index]?.id;
  const createHighlighted = index === assignable.length;

  function openCreateView() {
    setNewName(search.trim());
    setView("create");
  }

  function handleListKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedTagId) handlePick(highlightedTagId);
      else openCreateView();
    }
  }

  function handlePick(tagId: string) {
    onAssign(tagId);
    setOpen(false);
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setCreateError("Name cannot be empty");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreate(name, newColor);
      onAssign(created.id);
      setOpen(false);
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "Failed to create tag";
      const code = (err as { data?: { code?: string } })?.data?.code;
      if (code === "CONFLICT") setCreateError("A tag with this name already exists");
      else setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger ? <PopoverTrigger render={trigger as React.ReactElement} /> : null}
      <PopoverContent align={align} anchor={anchor} className="w-64 p-0">
        {view === "list" ? (
          <div ref={listRef} className="flex flex-col">
            <div className="border-b p-2">
              <Input
                autoFocus
                placeholder="Search or create…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleListKeyDown}
                className="h-7"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">No tags match.</p>
              ) : (
                filtered.map((tag) => {
                  const isSelected = selectedTagIds.has(tag.id);
                  const isHighlighted = tag.id === highlightedTagId;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => !isSelected && handlePick(tag.id)}
                      disabled={isSelected}
                      data-highlighted={isHighlighted}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none",
                        isSelected ? "cursor-default opacity-60" : "hover:bg-accent hover:text-accent-foreground",
                        isHighlighted && "bg-accent text-accent-foreground"
                      )}
                    >
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: tag.color, borderColor: `${tag.color}80` }}
                      />
                      <span className="flex-1 truncate">{tag.name}</span>
                      {isSelected ? <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  );
                })
              )}
            </div>
            <button
              type="button"
              onClick={openCreateView}
              data-highlighted={createHighlighted}
              className={cn(
                "flex items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                createHighlighted && "bg-accent text-accent-foreground"
              )}
            >
              <PlusIcon className="size-3.5" />
              Create new tag{search.trim() ? ` "${search.trim()}"` : ""}
            </button>
          </div>
        ) : (
          <div className="flex flex-col p-3">
            <div className="mb-2 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setView("list")}
                aria-label="Back to tag list"
              >
                <ArrowLeftIcon />
              </Button>
              <span className="text-sm font-medium">New tag</span>
            </div>
            <Input
              autoFocus
              placeholder="Tag name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (createError) setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
              maxLength={64}
              className="h-7"
            />
            <div className="mt-3 grid grid-cols-8 gap-1.5">
              {TAG_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={newColor === c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "size-5 rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    newColor === c ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background" : ""
                  )}
                  style={{ backgroundColor: c, borderColor: `${c}80` }}
                />
              ))}
            </div>
            {createError ? <p className="mt-2 text-xs text-destructive">{createError}</p> : null}
            <Button
              type="button"
              size="sm"
              className="mt-3 self-end"
              disabled={creating}
              onClick={() => void handleCreate()}
            >
              {creating ? "Creating…" : "Create & assign"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
