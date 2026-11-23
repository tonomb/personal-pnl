import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Category } from "@pnl/types";

type MutationOpts = { onError?: (err: unknown) => void; onSuccess?: (data: any) => void };

const mutations: Record<string, { opts: MutationOpts; mutate: ReturnType<typeof vi.fn> }> = {};
function mockMutation(name: string) {
  return (opts: MutationOpts) => {
    const mutate = mutations[name]?.mutate ?? vi.fn();
    mutations[name] = { opts, mutate };
    return { mutate, isPending: false };
  };
}

const invalidate = {
  categories: vi.fn(),
  transactions: vi.fn(),
  pnl: vi.fn(),
  tags: vi.fn()
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      categories: { list: { invalidate: invalidate.categories } },
      transactions: { invalidate: invalidate.transactions },
      pnl: { invalidate: invalidate.pnl },
      tags: { invalidate: invalidate.tags }
    }),
    categories: {
      list: { useQuery: vi.fn() },
      create: { useMutation: (o: MutationOpts) => mockMutation("create")(o) },
      update: { useMutation: (o: MutationOpts) => mockMutation("update")(o) },
      delete: { useMutation: (o: MutationOpts) => mockMutation("delete")(o) }
    },
    transactions: {
      list: { useQuery: vi.fn() }
    }
  }
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { trpc } from "@/lib/trpc";
import { CategoriesPage, groupMoveNote } from "./CategoriesPage";

const mockList = trpc.categories.list.useQuery as ReturnType<typeof vi.fn>;
const mockTxList = trpc.transactions.list.useQuery as ReturnType<typeof vi.fn>;

function aCategory(id: number, name: string, groupType: Category["groupType"], isDefault = true): Category {
  return { id, name, groupType, isDefault, color: null, sortOrder: id * 10 };
}

const data = {
  INCOME: [aCategory(1, "Salary", "INCOME")],
  FIXED: [aCategory(2, "Rent", "FIXED")],
  VARIABLE: [aCategory(3, "Groceries", "VARIABLE"), aCategory(4, "Pottery", "VARIABLE", false)],
  IGNORED: []
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mutations)) delete mutations[key];
  mockList.mockReturnValue({ data, isLoading: false });
  mockTxList.mockReturnValue({ data: undefined, isError: false });
});

describe("groupMoveNote", () => {
  it("returns nothing when the Group is unchanged", () => {
    expect(groupMoveNote("FIXED", "FIXED")).toBeNull();
  });

  it("says the transactions switch P&L side when crossing income/expense", () => {
    expect(groupMoveNote("VARIABLE", "INCOME")).toMatch(/other side of the P&L: Expenses → Income/);
    expect(groupMoveNote("INCOME", "IGNORED")).toMatch(/other side of the P&L: Income → Ignored/);
  });

  it("explains a move between expense Groups", () => {
    expect(groupMoveNote("FIXED", "VARIABLE")).toMatch(/from Fixed to Variable expenses/);
  });
});

describe("CategoriesPage", () => {
  it("lists categories grouped by Group in saved order and marks defaults vs custom", () => {
    render(<CategoriesPage />);

    const variable = screen.getByRole("region", { name: /variable/i });
    const items = within(variable).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Groceries"),
      expect.stringContaining("Pottery")
    ]);
    expect(within(items[0]!).getByText("Default")).toBeInTheDocument();
    expect(within(items[1]!).getByText("Custom")).toBeInTheDocument();

    expect(within(screen.getByRole("region", { name: /ignored/i })).getByText(/no categories/i)).toBeInTheDocument();
  });

  it("creates a category with the chosen Group and invalidates categories and transactions", async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);

    await user.click(screen.getByRole("button", { name: /add a category to fixed/i }));
    await user.type(await screen.findByLabelText("Name"), "  Gym  ");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(mutations.create!.mutate).toHaveBeenCalledWith({ name: "Gym", groupType: "FIXED", color: null });

    act(() => mutations.create!.opts.onSuccess?.(aCategory(9, "Gym", "FIXED", false)));
    expect(invalidate.categories).toHaveBeenCalled();
    expect(invalidate.transactions).toHaveBeenCalled();
  });

  it("opens the create dialog with the N shortcut", async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);

    await user.keyboard("n");
    expect(await screen.findByRole("dialog", { name: /new category/i })).toBeInTheDocument();
  });

  it("shows a duplicate name inline and keeps the form open", async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);

    await user.click(screen.getByRole("button", { name: /new category/i }));
    await user.type(await screen.findByLabelText("Name"), "rent");
    await user.click(screen.getByRole("button", { name: "Create" }));

    act(() => mutations.create!.opts.onError?.({ data: { code: "CONFLICT" } }));

    expect(screen.getByRole("alert")).toHaveTextContent(/"rent" already exists/i);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("sends only the changed fields when editing", async () => {
    const user = userEvent.setup();
    render(<CategoriesPage />);

    await user.click(screen.getByRole("button", { name: "Edit Pottery" }));
    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Ceramics");
    await user.click(screen.getByRole("button", { name: "#3b82f6" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mutations.update!.mutate).toHaveBeenCalledWith({ id: 4, name: "Ceramics", color: "#3b82f6" });
  });

  it("shows how many transactions will become uncategorized before deleting", async () => {
    mockTxList.mockReturnValue({ data: { rows: [], total: 12 }, isError: false });
    const user = userEvent.setup();
    render(<CategoriesPage />);

    await user.click(screen.getByRole("button", { name: "Delete Groceries" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/12 transactions will become uncategorized/i);
    expect(mockTxList).toHaveBeenLastCalledWith(
      { categoryId: 3, limit: 1, offset: 0 },
      expect.objectContaining({ enabled: true })
    );

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(mutations.delete!.mutate).toHaveBeenCalledWith({ id: 3 });

    act(() => mutations.delete!.opts.onSuccess?.({ deletedId: 3, uncategorizedCount: 12 }));
    expect(invalidate.categories).toHaveBeenCalled();
    expect(invalidate.transactions).toHaveBeenCalled();
  });
});
