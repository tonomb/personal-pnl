import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RawPreviewPanel } from "./RawPreviewPanel";

const HEADERS = ["Date", "Desc", "Amt"];

function makeRows(n: number): Array<Record<string, string>> {
  return Array.from({ length: n }, (_, i) => ({
    Date: `2024-01-${String(i + 1).padStart(2, "0")}`,
    Desc: `row-${i}`,
    Amt: String(i)
  }));
}

describe("RawPreviewPanel", () => {
  it("renders every header as a column", () => {
    render(<RawPreviewPanel headers={HEADERS} rawRows={[{ Date: "2024-01-01", Desc: "x", Amt: "1" }]} />);
    for (const h of HEADERS) {
      expect(screen.getByRole("columnheader", { name: h })).toBeInTheDocument();
    }
  });

  it("renders the cell values for each row in header order", () => {
    render(
      <RawPreviewPanel
        headers={HEADERS}
        rawRows={[
          { Date: "2024-01-01", Desc: "Coffee", Amt: "-4.50" },
          { Date: "2024-01-02", Desc: "Tea", Amt: "-3.00" }
        ]}
      />
    );
    expect(screen.getByText("Coffee")).toBeInTheDocument();
    expect(screen.getByText("-4.50")).toBeInTheDocument();
    expect(screen.getByText("Tea")).toBeInTheDocument();
    expect(screen.getByText("-3.00")).toBeInTheDocument();
  });

  it("caps the number of body rows at 10 by default when given more", () => {
    render(<RawPreviewPanel headers={HEADERS} rawRows={makeRows(15)} />);
    const body = screen.getAllByRole("rowgroup")[1];
    expect(within(body).getAllByRole("row")).toHaveLength(10);
    expect(screen.getByText("row-9")).toBeInTheDocument();
    expect(screen.queryByText("row-10")).not.toBeInTheDocument();
  });

  it("displays the count of shown rows out of the total", () => {
    render(<RawPreviewPanel headers={HEADERS} rawRows={makeRows(15)} />);
    expect(screen.getByText(/first 10 of 15 rows/i)).toBeInTheDocument();
  });

  it("shows the actual count when there are fewer rows than the cap", () => {
    render(<RawPreviewPanel headers={HEADERS} rawRows={makeRows(3)} />);
    expect(screen.getByText(/first 3 of 3 rows/i)).toBeInTheDocument();
  });

  it("shows an empty-state message and no table when there are no rows", () => {
    render(<RawPreviewPanel headers={HEADERS} rawRows={[]} />);
    expect(screen.getByText(/no rows in file/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
