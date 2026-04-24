import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { KpiSummary, MonthlyPnL } from "@pnl/types";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    pnl: {
      getKpis: {
        useQuery: vi.fn()
      }
    }
  }
}));

import { trpc } from "@/lib/trpc";
import { KpiCards } from "./KpiCards";

const mockUseQuery = trpc.pnl.getKpis.useQuery as ReturnType<typeof vi.fn>;

const aMonth: MonthlyPnL = {
  month: "2024-03",
  income: { total: 3000, items: [] },
  fixed: { total: 1000, items: [] },
  variable: { total: 500, items: [] },
  ignored: { total: 0, items: [] },
  net: 1500,
  savingsRate: 0.5
};

const aKpiSummary: KpiSummary = {
  month: "2024-03",
  net: 1500,
  netLabel: "IN_THE_GREEN",
  savingsRate: 0.5,
  savingsLabel: "HEALTHY",
  biggestExpense: { name: "Rent", total: 1000 },
  vsLastMonth: { delta: 300, label: "BETTER" }
};

describe("KpiCards", () => {
  it("renders 4 skeleton cards while loading", () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    render(<KpiCards months={[aMonth]} focusedMonth="2024-03" isReportLoading={false} />);

    expect(screen.getAllByTestId("kpi-skeleton")).toHaveLength(4);
    expect(screen.queryByTestId("kpi-net")).toBeNull();
  });

  it("shows net value and IN THE GREEN label when net is positive", () => {
    mockUseQuery.mockReturnValue({ data: aKpiSummary, isLoading: false });

    render(<KpiCards months={[aMonth]} focusedMonth="2024-03" isReportLoading={false} />);

    expect(screen.getByTestId("kpi-net")).toBeInTheDocument();
    expect(screen.getByText("$1,500.00")).toBeInTheDocument();
    expect(screen.getByText("IN THE GREEN")).toBeInTheDocument();
  });

  it("shows savings rate value and HEALTHY label", () => {
    mockUseQuery.mockReturnValue({ data: aKpiSummary, isLoading: false });

    render(<KpiCards months={[aMonth]} focusedMonth="2024-03" isReportLoading={false} />);

    expect(screen.getByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("HEALTHY")).toBeInTheDocument();
  });

  it("shows biggest expense category name and amount", () => {
    mockUseQuery.mockReturnValue({ data: aKpiSummary, isLoading: false });

    render(<KpiCards months={[aMonth]} focusedMonth="2024-03" isReportLoading={false} />);

    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
  });

  it("shows vs last month delta with BETTER label", () => {
    mockUseQuery.mockReturnValue({ data: aKpiSummary, isLoading: false });

    render(<KpiCards months={[aMonth]} focusedMonth="2024-03" isReportLoading={false} />);

    expect(screen.getByText("+$300.00")).toBeInTheDocument();
    expect(screen.getByText("BETTER")).toBeInTheDocument();
  });

  it("uses the latest month when focusedMonth is undefined", () => {
    mockUseQuery.mockReturnValue({ data: aKpiSummary, isLoading: false });

    const months: MonthlyPnL[] = [
      { ...aMonth, month: "2024-01" },
      { ...aMonth, month: "2024-02" },
      { ...aMonth, month: "2024-03" }
    ];

    render(<KpiCards months={months} focusedMonth={undefined} isReportLoading={false} />);

    expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ month: "2024-03" }), expect.any(Object));
  });
});
