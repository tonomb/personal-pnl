import * as React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Tag } from "@pnl/types";

import { Button } from "@/components/ui/button";

import { TagPicker } from "./TagPicker";

const tags: Tag[] = [{ id: "t1", name: "Trip", color: "#ef4444", createdAt: "2026-01-01" }];

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
});
