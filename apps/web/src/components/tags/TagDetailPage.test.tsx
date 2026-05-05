import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={String(to)} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tags: {
      getReport: {
        useQuery: vi.fn()
      }
    }
  }
}));

import { trpc } from "@/lib/trpc";
import { TagDetailPage } from "./TagDetailPage";

import type { TagReport } from "@pnl/types";

const mockGetReport = trpc.tags.getReport.useQuery as ReturnType<typeof vi.fn>;

const aTag = { id: "tag-1", name: "NY Trip", color: "#3B82F6", createdAt: "2026-01-15T12:00:00.000Z" };

const aReport: TagReport = {
  tag: aTag,
  totalSpend: 1520,
  totalIncome: 175, // Salary 100 + Bonus 75 — unique so $175.00 only appears in KPI
  net: -1345,
  byCategory: [
    { categoryId: 1, categoryName: "Salary", groupType: "INCOME", total: 100 },
    { categoryId: 4, categoryName: "Bonus", groupType: "INCOME", total: 75 },
    { categoryId: 2, categoryName: "Hotel", groupType: "FIXED", total: 600 },
    { categoryId: 3, categoryName: "Food", groupType: "VARIABLE", total: 920 }
  ],
  transactions: [
    {
      id: "tx-1",
      date: "2026-01-10",
      description: "Hotel Marriott",
      amount: 600,
      type: "DEBIT",
      categoryId: 2,
      accountId: null,
      sourceFile: null,
      rawRow: null,
      createdAt: "2026-01-10T00:00:00Z",
      tags: [aTag]
    },
    {
      id: "tx-2",
      date: "2026-01-12",
      description: "Dinner",
      amount: 920,
      type: "DEBIT",
      categoryId: 3,
      accountId: null,
      sourceFile: null,
      rawRow: null,
      createdAt: "2026-01-12T00:00:00Z",
      tags: [aTag]
    },
    {
      id: "tx-3",
      date: "2026-01-13",
      description: "Refund",
      amount: 100,
      type: "CREDIT",
      categoryId: 1,
      accountId: null,
      sourceFile: null,
      rawRow: null,
      createdAt: "2026-01-13T00:00:00Z",
      tags: [aTag]
    }
  ],
  dateRange: { from: "2026-01-10", to: "2026-01-13" }
};

describe("TagDetailPage", () => {
  it("shows a loading spinner while fetching", () => {
    mockGetReport.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    expect(screen.getByTestId("tag-detail-loading")).toBeInTheDocument();
  });

  it("shows error state when the tag is not found", () => {
    mockGetReport.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<TagDetailPage tagId="bad-id" />);
    expect(screen.getByText(/tag not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /all tags/i })).toHaveAttribute("href", "/tags");
  });

  it("shows tag name in the header", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    // NY Trip also appears in transaction tags column, so multiple elements are expected
    expect(screen.getAllByText("NY Trip").length).toBeGreaterThan(0);
  });

  it("shows total spend, income, and net figures", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    expect(screen.getByTestId("tag-detail-spend")).toHaveTextContent("$1,520.00");
    expect(screen.getByTestId("tag-detail-income")).toHaveTextContent("$175.00");
    expect(screen.getByTestId("tag-detail-net")).toHaveTextContent("-$1,345.00");
  });

  it("applies text-destructive class when net is negative", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    const netEl = screen.getByTestId("tag-detail-net");
    expect(netEl).toHaveClass("text-destructive");
  });

  it("applies text-income class when net is positive", () => {
    const positiveReport = { ...aReport, net: 500 };
    mockGetReport.mockReturnValue({ data: positiveReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    const netEl = screen.getByTestId("tag-detail-net");
    expect(netEl).toHaveClass("text-income");
  });

  it("groups category breakdown by INCOME / FIXED / VARIABLE sections", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    expect(screen.getByText("INCOME")).toBeInTheDocument();
    expect(screen.getByText("FIXED")).toBeInTheDocument();
    expect(screen.getByText("VARIABLE")).toBeInTheDocument();
    expect(screen.getByText("Salary")).toBeInTheDocument();
    expect(screen.getByText("Hotel")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("shows section subtotals in the category breakdown", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    expect(screen.getByText("Total INCOME")).toBeInTheDocument();
    expect(screen.getByText("Total FIXED")).toBeInTheDocument();
    expect(screen.getByText("Total VARIABLE")).toBeInTheDocument();
  });

  it("shows empty state in breakdown when no categorized transactions", () => {
    const emptyReport = { ...aReport, byCategory: [] };
    mockGetReport.mockReturnValue({ data: emptyReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    expect(screen.getByText(/no categorized transactions/i)).toBeInTheDocument();
  });

  it("renders transactions newest-first (reversed from backend order)", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    const rows = screen.getAllByRole("row");
    const descriptions = rows.map((r) => r.textContent ?? "");
    const refundIdx = descriptions.findIndex((t) => t.includes("Refund"));
    const hotelIdx = descriptions.findIndex((t) => t.includes("Hotel Marriott"));
    // Refund is the latest date (2026-01-13), Hotel is earliest (2026-01-10)
    expect(refundIdx).toBeLessThan(hotelIdx);
  });

  it("breadcrumb link points to /tags", () => {
    mockGetReport.mockReturnValue({ data: aReport, isLoading: false, isError: false });
    render(<TagDetailPage tagId="tag-1" />);
    const breadcrumb = screen.getAllByRole("link", { name: /all tags/i })[0];
    expect(breadcrumb).toHaveAttribute("href", "/tags");
  });
});
