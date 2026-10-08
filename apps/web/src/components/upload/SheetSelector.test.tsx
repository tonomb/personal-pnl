import { render, screen, within } from "@testing-library/react";
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

describe("SheetSelector — file preview", () => {
  const PREVIEW = [
    ["Report Title", "", ""],
    ["", "", ""],
    ["Date", "Description", "Amount"],
    ["2024-01-01", "Coffee", "4.50"]
  ];

  it("shows the top rows of the sheet so the header row can be found", () => {
    render(
      <SheetSelector sheetNames={SINGLE_SHEET} getPreviewRows={() => PREVIEW} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    const table = screen.getByRole("table", { name: /file preview/i });
    expect(within(table).getAllByRole("row")).toHaveLength(PREVIEW.length);
    expect(within(table).getByText("Report Title")).toBeInTheDocument();
    expect(within(table).getByText("Coffee")).toBeInTheDocument();
  });

  it("renders no preview when getPreviewRows is not provided", () => {
    render(<SheetSelector sheetNames={SINGLE_SHEET} onSelect={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole("table", { name: /file preview/i })).not.toBeInTheDocument();
  });

  it("shows the preview only once a sheet is picked in a multi-sheet workbook", async () => {
    const user = userEvent.setup();
    const getPreviewRows = vi.fn(() => PREVIEW);
    render(
      <SheetSelector sheetNames={MULTI_SHEETS} getPreviewRows={getPreviewRows} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    expect(screen.queryByRole("table", { name: /file preview/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /sheet/i }), "Savings");

    expect(screen.getByRole("table", { name: /file preview/i })).toBeInTheDocument();
    expect(getPreviewRows).toHaveBeenCalledWith("Savings");
  });

  it("marks the row matching the header row input as selected", async () => {
    const user = userEvent.setup();
    render(
      <SheetSelector sheetNames={SINGLE_SHEET} getPreviewRows={() => PREVIEW} onSelect={vi.fn()} onCancel={vi.fn()} />
    );
    const rows = within(screen.getByRole("table", { name: /file preview/i })).getAllByRole("row");
    expect(rows[0]).toHaveAttribute("aria-selected", "true");

    const input = screen.getByRole("textbox", { name: /header row/i });
    await user.clear(input);
    await user.type(input, "3");

    expect(rows[0]).toHaveAttribute("aria-selected", "false");
    expect(rows[2]).toHaveAttribute("aria-selected", "true");
  });

  it("clicking a preview row sets it as the header row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SheetSelector sheetNames={SINGLE_SHEET} getPreviewRows={() => PREVIEW} onSelect={onSelect} onCancel={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: /use row 3 as header/i }));

    expect(screen.getByRole("textbox", { name: /header row/i })).toHaveValue("3");
    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onSelect).toHaveBeenCalledWith(SINGLE_SHEET[0], 2);
  });

  it("renders no preview when reading the sheet fails", () => {
    render(
      <SheetSelector
        sheetNames={SINGLE_SHEET}
        getPreviewRows={() => {
          throw new Error("boom");
        }}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.queryByRole("table", { name: /file preview/i })).not.toBeInTheDocument();
  });
});
