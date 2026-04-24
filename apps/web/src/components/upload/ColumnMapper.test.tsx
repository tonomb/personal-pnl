import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ColumnMapper } from "./ColumnMapper";

const HEADERS = ["Date", "Desc", "Amt"];
const PREVIEW_ROWS = [["2024-01-01", "Coffee", "-4.50"]];

describe("ColumnMapper", () => {
  it("renders a Confirm button that is disabled before required fields are selected", () => {
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("enables Confirm and fires onConfirm with correct mapping after all fields selected", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");
    await user.selectOptions(screen.getByRole("combobox", { name: /description/i }), "Desc");
    await user.selectOptions(screen.getByRole("combobox", { name: /amount/i }), "Amt");

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      dateCol: "Date",
      descriptionCol: "Desc",
      amountCol: "Amt",
      debitCol: undefined,
      creditCol: undefined,
      useDebitCredit: false
    });
  });

  it("shows preview table data for mapped columns after Date is selected", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText("2024-01-01")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");

    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
  });
});
