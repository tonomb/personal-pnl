import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ColumnMapper } from "./ColumnMapper";

import type { AccountWithBenefits } from "@pnl/types";

const HEADERS = ["Date", "Desc", "Amt"];
const PREVIEW_ROWS = [["2024-01-01", "Coffee", "-4.50"]];

const ACCOUNTS: AccountWithBenefits[] = [
  {
    id: "acc-1",
    name: "Checking",
    institution: "Bank",
    type: "CHECKING",
    currency: "MXN",
    last4: "1234",
    color: "#3b82f6",
    createdAt: "2024-01-01T00:00:00.000Z",
    benefits: []
  }
];

async function selectAccount(user: ReturnType<typeof userEvent.setup>, name = /checking/i) {
  await user.click(screen.getByRole("combobox", { name: /account/i }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("ColumnMapper", () => {
  it("renders a Confirm button that is disabled before required fields are selected", () => {
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("stays disabled with columns mapped but no account selected", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");
    await user.selectOptions(screen.getByRole("combobox", { name: /description/i }), "Desc");
    await user.selectOptions(screen.getByRole("combobox", { name: /amount/i }), "Amt");

    expect(screen.getByRole("button", { name: /confirm/i })).toBeDisabled();
  });

  it("enables Confirm and fires onConfirm with mapping and accountId after all fields selected", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        accounts={ACCOUNTS}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");
    await user.selectOptions(screen.getByRole("combobox", { name: /description/i }), "Desc");
    await user.selectOptions(screen.getByRole("combobox", { name: /amount/i }), "Amt");
    await selectAccount(user);

    const confirmBtn = screen.getByRole("button", { name: /confirm/i });
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith(
      {
        dateCol: "Date",
        descriptionCol: "Desc",
        amountCol: "Amt",
        debitCol: undefined,
        creditCol: undefined,
        useDebitCredit: false
      },
      "acc-1"
    );
  });

  it("pre-fills mapping fields and account from initialMapping/initialAccountId", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        accounts={ACCOUNTS}
        initialAccountId="acc-1"
        initialMapping={{
          dateCol: "Date",
          descriptionCol: "Desc",
          amountCol: "Amt",
          debitCol: undefined,
          creditCol: undefined,
          useDebitCredit: false
        }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /confirm/i })).not.toBeDisabled();

    await user.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      {
        dateCol: "Date",
        descriptionCol: "Desc",
        amountCol: "Amt",
        debitCol: undefined,
        creditCol: undefined,
        useDebitCredit: false
      },
      "acc-1"
    );
  });

  it("shows preview table data for mapped columns after Date is selected", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={HEADERS}
        previewRows={PREVIEW_ROWS}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByText("2024-01-01")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");

    expect(screen.getByText("2024-01-01")).toBeInTheDocument();
  });

  it("normalizes a non-ISO date like '31 Jan 2026' to '2026-01-31' in the preview", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={["Date", "Desc", "Amt"]}
        previewRows={[["31 Jan 2026", "Groceries", "-12.00"]]}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");

    expect(screen.getByText("2026-01-31")).toBeInTheDocument();
  });

  it("shows unparseable date values in red text", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={["Date", "Desc", "Amt"]}
        previewRows={[["not-a-date", "Groceries", "-12.00"]]}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");

    const bad = screen.getByText("not-a-date");
    expect(bad.tagName).toBe("SPAN");
    expect(bad).toHaveClass("text-destructive");
  });

  it("adds preview columns live as each mapping is selected", async () => {
    const user = userEvent.setup();
    render(
      <ColumnMapper
        fileName="bank.csv"
        headers={["Date", "Desc", "Amt"]}
        previewRows={[["2024-03-15", "Salary", "1000.00"]]}
        accounts={ACCOUNTS}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /date/i }), "Date");
    expect(screen.getByRole("columnheader", { name: /date/i })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /description/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: /description/i }), "Desc");
    expect(screen.getByRole("columnheader", { name: /description/i })).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
  });
});
