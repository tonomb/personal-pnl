import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SheetSelector } from "./SheetSelector";

const MULTI_SHEETS = ["Sheet1", "Savings", "Summary"];
const SINGLE_SHEET = ["Detalles de la operación"];

describe("SheetSelector — sheet selection", () => {
  it("renders a sheet select when multiple sheets are present", () => {
    render(<SheetSelector sheetNames={MULTI_SHEETS} onSelect={vi.fn()} onCancel={vi.fn()} />);
    for (const name of MULTI_SHEETS) {
      expect(screen.getByRole("option", { name })).toBeInTheDocument();
    }
  });

  it("does not render a sheet select when only one sheet exists", () => {
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("option", { name: SINGLE_SHEET[0] })).not.toBeInTheDocument();
  });

  it("confirm button is disabled until a sheet is selected (multi-sheet)", () => {
    render(<SheetSelector sheetNames={MULTI_SHEETS} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("confirm button is enabled immediately for single-sheet workbooks", () => {
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: /confirm/i })).not.toBeDisabled();
  });
});

describe("SheetSelector — header row", () => {
  it("renders a header row text input defaulting to 1", () => {
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByRole("textbox", { name: /header row/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("1");
  });

  it("accepts direct keyboard entry of a number", async () => {
    const user = userEvent.setup();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "7");

    expect(input).toHaveValue("7");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onSelect with sheetName and 0-indexed headerRow when confirmed", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={onSelect} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "7");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    // user enters 1-indexed (7), we pass 0-indexed (6)
    expect(onSelect).toHaveBeenCalledWith(SINGLE_SHEET[0], 6);
  });

  it("passes headerRow=0 when the default (1) is unchanged", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<SheetSelector sheetNames={MULTI_SHEETS} onSelect={onSelect} onCancel={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox"), "Savings");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSelect).toHaveBeenCalledWith("Savings", 0);
  });

  it("shows an error and disables confirm for non-numeric input", async () => {
    const user = userEvent.setup();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "abc");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("shows an error and disables confirm for zero", async () => {
    const user = userEvent.setup();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "0");

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("shows an error and disables confirm when the field is cleared", async () => {
    const user = userEvent.setup();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("recovers from an error state once a valid number is entered", async () => {
    const user = userEvent.setup();
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "abc");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "3");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).not.toBeDisabled();
  });
});

describe("SheetSelector — cancel", () => {
  it("calls onCancel when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SheetSelector sheetNames={MULTI_SHEETS} onSelect={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
