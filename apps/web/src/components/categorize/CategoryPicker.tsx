import * as React from "react";

import type { CategoriesByGroup, Category } from "@pnl/types";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useListHighlight } from "@/lib/use-list-highlight";
import { cn } from "@/lib/utils";

type CategoryPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element the popup is positioned against (there is no trigger). */
  anchor: Element | null;
  catData: CategoriesByGroup | undefined;
  /** How many transactions the pick applies to. */
  targetCount: number;
  onPick: (categoryId: number | null) => void;
};

type Option = { key: string; categoryId: number | null; name: string; color: string | null; group: string | null };

const GROUPS = ["INCOME", "FIXED", "VARIABLE", "IGNORED"] as const;

function groupLabel(group: string): string {
  return group.charAt(0) + group.slice(1).toLowerCase();
}

export function CategoryPicker({ open, onOpenChange, anchor, catData, targetCount, onPick }: CategoryPickerProps) {
  const [search, setSearch] = React.useState("");
  const listId = React.useId();

  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const options = React.useMemo<Option[]>(() => {
    const all: Option[] = [
      { key: "none", categoryId: null, name: "None (remove category)", color: null, group: null },
      ...GROUPS.flatMap((group) =>
        (catData?.[group] ?? []).map((c: Category) => ({
          key: String(c.id),
          categoryId: c.id,
          name: c.name,
          color: c.color ?? null,
          group
        }))
      )
    ];
    const q = search.trim().toLowerCase();
    return q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all;
  }, [catData, search]);

  const { index, move, listRef } = useListHighlight(options.length, search);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = options[index];
      if (option) onPick(option.categoryId);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverContent anchor={anchor} align="end" className="w-64 p-0" aria-label="Categorize">
        <div className="flex flex-col">
          <div className="space-y-1.5 border-b p-2">
            <p className="px-1 text-xs text-muted-foreground">
              Categorize {targetCount} {targetCount === 1 ? "transaction" : "transactions"}
            </p>
            <Input
              autoFocus
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={index >= 0 ? `${listId}-${index}` : undefined}
              aria-label="Search categories"
              placeholder="Search categories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Categories"
            className="max-h-64 overflow-y-auto py-1"
          >
            {options.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No categories match.</p>
            ) : (
              options.map((option, i) => (
                <React.Fragment key={option.key}>
                  {option.group && option.group !== options[i - 1]?.group ? (
                    <p className="px-3 pt-2 pb-1 text-xs text-muted-foreground">{groupLabel(option.group)}</p>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    id={`${listId}-${i}`}
                    aria-selected={i === index}
                    data-highlighted={i === index}
                    tabIndex={-1}
                    onClick={() => onPick(option.categoryId)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                      i === index && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-3 shrink-0 rounded-full border"
                      style={
                        option.color ? { backgroundColor: option.color, borderColor: `${option.color}80` } : undefined
                      }
                    />
                    <span className="flex-1 truncate">{option.name}</span>
                  </button>
                </React.Fragment>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
