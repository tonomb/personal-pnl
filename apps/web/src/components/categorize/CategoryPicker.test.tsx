import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CategoriesByGroup, Category } from "@pnl/types";

import { CategoryPicker } from "./CategoryPicker";

function aCategory(id: number, name: string, groupType: Category["groupType"]): Category {
  return { id, name, groupType, color: "#22c55e" } as Category;
}

const catData: CategoriesByGroup = {
  INCOME: [aCategory(1, "Salary", "INCOME")],
  FIXED: [aCategory(2, "Rent", "FIXED")],
  VARIABLE: [aCategory(3, "Groceries", "VARIABLE"), aCategory(4, "Restaurants", "VARIABLE")],
  IGNORED: []
};

function renderPicker() {
  const onPick = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <CategoryPicker open onOpenChange={onOpenChange} anchor={null} catData={catData} targetCount={3} onPick={onPick} />
  );
  return { onPick, onOpenChange, user: userEvent.setup() };
}

describe("CategoryPicker", () => {
  it("focuses the search box and says how many transactions it applies to", async () => {
    renderPicker();
    expect(await screen.findByRole("combobox", { name: "Search categories" })).toHaveFocus();
    expect(screen.getByText("Categorize 3 transactions")).toBeInTheDocument();
  });

  it("filters by typed text and assigns the first match on Enter", async () => {
    const { onPick, user } = renderPicker();
    await screen.findByRole("combobox");

    await user.keyboard("re");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "None (remove category)",
      "Rent",
      "Restaurants"
    ]);

    await user.keyboard("nt{Enter}");
    expect(onPick).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("moves the highlight with the arrow keys and stops at the ends", async () => {
    const { onPick, user } = renderPicker();
    await screen.findByRole("combobox");

    await user.keyboard("{ArrowUp}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("option", { name: "Rent" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    expect(onPick).toHaveBeenCalledExactlyOnceWith(4);
  });

  it("removes the category when Enter is pressed on None", async () => {
    const { onPick, user } = renderPicker();
    await screen.findByRole("combobox");

    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledExactlyOnceWith(null);
  });

  it("does nothing on Enter when no category matches", async () => {
    const { onPick, user } = renderPicker();
    await screen.findByRole("combobox");

    await user.keyboard("zzz{Enter}");
    expect(screen.getByText("No categories match.")).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("asks to close on Escape without assigning", async () => {
    const { onPick, onOpenChange, user } = renderPicker();
    await screen.findByRole("combobox");

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalled();
    expect(onOpenChange.mock.calls[0]![0]).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });
});
