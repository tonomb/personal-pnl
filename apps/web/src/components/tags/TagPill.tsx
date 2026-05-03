import { XIcon } from "lucide-react";

import type { Tag } from "@pnl/types";

import { cn } from "@/lib/utils";

type TagPillProps = {
  tag: Tag;
  onRemove?: () => void;
  className?: string;
};

export function TagPill({ tag, onRemove, className }: TagPillProps) {
  const color = tag.color;
  return (
    <span
      data-slot="tag-pill"
      className={cn(
        "inline-flex h-5 max-w-[140px] shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `${color}26`,
        borderColor: `${color}4D`,
        color
      }}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${tag.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-0.5 grid size-3.5 shrink-0 place-items-center rounded-full hover:bg-foreground/10"
          style={{ color }}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
