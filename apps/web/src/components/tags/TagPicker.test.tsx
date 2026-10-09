import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Tag } from "@pnl/types";

import { Button } from "@/components/ui/button";

import { TagPicker } from "./TagPicker";

const tags: Tag[] = [{ id: "t1", name: "Trip", color: "#ef4444", createdAt: "2026-01-01" }];

const manyTags: Tag[] = [
  { id: "t1", name: "Trip", color: "#ef4444", createdAt: "2026-01-01" },
  { id: "t2", name: "Work", color: "#3b82f6", createdAt: "2026-01-01" },
  { id: "t3", name: "Gifts", color: "#22c55e", createdAt: "2026-01-01" }
];

/** The picker as the Categorize page opens it from the keyboard: no trigger, open from the start. */
function renderControlled(selectedTagIds: ReadonlySet<string> = new Set()) {
  const onAssign = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <TagPicker
      open
      onOpenChange={onOpenChange}
      anchor={null}
      tags={manyTags}
      selectedTagIds={selectedTagIds}
      onAssign={onAssign}
      onCreate={vi.fn()}
    />
  );
  return { onAssign, onOpenChange, user: userEvent.setup() };
}

function renderPicker() {
  return render(
    <TagPicker
      tags={tags}
      selectedTagIds={new Set()}
      onAssign={vi.fn()}
      onCreate={vi.fn()}
      trigger={<Button variant="outline">Add tag</Button>}
    />
  );
}

describe("TagPicker", () => {
  // Regression (LAG-45): Button must forward its ref so Base UI can anchor the popup to the trigger.
  // Without it the popup opened at (0, 0) on the first click and the trigger counted as an outside press.
  it("Button forwards its ref to the DOM button", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Click</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("opens on the first click and closes when the trigger is clicked again", async () => {
    const user = userEvent.setup();
    renderPicker();
    const trigger = screen.getByRole("button", { name: "Add tag" });

    await user.click(trigger);
    expect(await screen.findByPlaceholderText("Search or create…")).toBeVisible();

    await user.click(trigger);
    await waitFor(() => expect(screen.queryByPlaceholderText("Search or create…")).not.toBeInTheDocument());
  });

  it("opens without a trigger when controlled, with the search box focused", async () => {
    renderControlled();
    expect(await screen.findByPlaceholderText("Search or create…")).toHaveFocus();
  });

  it("assigns the highlighted tag on Enter and asks to close", async () => {
    const { onAssign, onOpenChange, user } = renderControlled();
    await screen.findByPlaceholderText("Search or create…");

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAssign).toHaveBeenCalledExactlyOnceWith("t2");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("assigns the first match of the typed text on Enter", async () => {
    const { onAssign, user } = renderControlled();
    await screen.findByPlaceholderText("Search or create…");

    await user.keyboard("gif{Enter}");
    expect(onAssign).toHaveBeenCalledExactlyOnceWith("t3");
  });

  it("skips tags that are already assigned", async () => {
    const { onAssign, user } = renderControlled(new Set(["t1", "t2"]));
    await screen.findByPlaceholderText("Search or create…");

    await user.keyboard("{Enter}");
    expect(onAssign).toHaveBeenCalledExactlyOnceWith("t3");
  });

  it("goes to the create view on Enter when nothing matches", async () => {
    const { onAssign, user } = renderControlled();
    await screen.findByPlaceholderText("Search or create…");

    await user.keyboard("Beach{Enter}");
    expect(await screen.findByPlaceholderText("Tag name")).toHaveValue("Beach");
    expect(onAssign).not.toHaveBeenCalled();
  });
});
