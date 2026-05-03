import type { Tag } from "@pnl/types";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TagFilterSelectProps = {
  tags: Tag[];
  value: string | undefined;
  onChange: (tagId: string | undefined) => void;
};

export function TagFilterSelect({ tags, value, onChange }: TagFilterSelectProps) {
  return (
    <Select value={value ?? ""} onValueChange={(val) => onChange((val as string) || undefined)}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="All tags" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="">All tags</SelectItem>
        {tags.map((tag) => (
          <SelectItem key={tag.id} value={tag.id}>
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="truncate">{tag.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
