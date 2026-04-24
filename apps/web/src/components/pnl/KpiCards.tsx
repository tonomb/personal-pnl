import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import type { KpiSummary, MonthlyPnL } from "@pnl/types";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { formatCurrency, formatMonthLabel, formatPercent } from "@/lib/pnl-helpers";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

interface KpiCardsProps {
  months: MonthlyPnL[];
  focusedMonth: string | undefined;
  isReportLoading: boolean;
}

const NET_LABELS: Record<KpiSummary["netLabel"], string> = {
  IN_THE_GREEN: "IN THE GREEN",
  IN_THE_RED: "IN THE RED",
  NEUTRAL: "NEUTRAL"
};

const SAVINGS_LABELS: Record<NonNullable<KpiSummary["savingsLabel"]>, string> = {
  HEALTHY: "HEALTHY",
  WATCH: "WATCH",
  DANGER: "DANGER"
};

const VS_LABELS: Record<NonNullable<KpiSummary["vsLastMonth"]>["label"], string> = {
  BETTER: "BETTER",
  WORSE: "WORSE",
  SAME: "SAME"
};

function netColorClass(label: KpiSummary["netLabel"]): string {
  if (label === "IN_THE_GREEN") return "text-income";
  if (label === "IN_THE_RED") return "text-destructive";
  return "text-muted-foreground";
}

function savingsColorClass(label: KpiSummary["savingsLabel"]): string {
  if (label === "HEALTHY") return "text-income";
  if (label === "WATCH") return "text-amber-600";
  if (label === "DANGER") return "text-destructive";
  return "text-muted-foreground";
}

function vsColorClass(label: NonNullable<KpiSummary["vsLastMonth"]>["label"]): string {
  if (label === "BETTER") return "text-income";
  if (label === "WORSE") return "text-destructive";
  return "text-muted-foreground";
}

export function KpiCards({ months, focusedMonth, isReportLoading }: KpiCardsProps) {
  const displayMonth = focusedMonth ?? months[months.length - 1]?.month;

  const { data: kpis, isLoading: isKpisLoading } = trpc.pnl.getKpis.useQuery(
    { month: displayMonth! },
    { enabled: !!displayMonth }
  );

  const isLoading = isReportLoading || isKpisLoading || !kpis;

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} data-testid="kpi-skeleton" className="h-28 w-full" />
        ))}
      </div>
    );
  }

  const monthLabel = formatMonthLabel(kpis.month);

  return (
    <div className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-4">
      {/* Net This Month */}
      <Tooltip content="Net income is total income minus all expenses; positive means you spent less than you earned.">
        <Card data-testid="kpi-net">
          <CardHeader>
            <CardTitle>Net This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold tabular-nums", netColorClass(kpis.netLabel))}>
              {formatCurrency(kpis.net)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{monthLabel}</p>
          </CardContent>
          <CardFooter>
            <span className={cn("text-xs font-semibold", netColorClass(kpis.netLabel))}>
              {NET_LABELS[kpis.netLabel]}
            </span>
          </CardFooter>
        </Card>
      </Tooltip>

      {/* Savings Rate */}
      <Tooltip content="Based on the 50/30/20 rule: ≥20% is healthy, 10–20% needs watching, <10% is a danger signal.">
        <Card>
          <CardHeader>
            <CardTitle>Savings Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-xl font-bold tabular-nums", savingsColorClass(kpis.savingsLabel))}>
              {kpis.savingsRate != null ? formatPercent(kpis.savingsRate) : "—"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{monthLabel}</p>
          </CardContent>
          <CardFooter>
            <span className={cn("text-xs font-semibold", savingsColorClass(kpis.savingsLabel))}>
              {kpis.savingsLabel ? SAVINGS_LABELS[kpis.savingsLabel] : "—"}
            </span>
          </CardFooter>
        </Card>
      </Tooltip>

      {/* Biggest Expense */}
      <Tooltip content="The single expense category with the highest total this month across fixed and variable spending.">
        <Card>
          <CardHeader>
            <CardTitle>Biggest Expense</CardTitle>
          </CardHeader>
          <CardContent>
            {kpis.biggestExpense ? (
              <>
                <p className="text-xl font-bold tabular-nums">{formatCurrency(kpis.biggestExpense.total)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{kpis.biggestExpense.name}</p>
              </>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
          <CardFooter>
            <span className="text-xs font-semibold text-muted-foreground">{monthLabel}</span>
          </CardFooter>
        </Card>
      </Tooltip>

      {/* vs Last Month */}
      <Tooltip content="Compares this month's net income to the prior month; positive delta means you kept more.">
        <Card>
          <CardHeader>
            <CardTitle>vs Last Month</CardTitle>
          </CardHeader>
          <CardContent>
            {kpis.vsLastMonth ? (
              <>
                <p
                  className={cn(
                    "flex items-center gap-1 text-xl font-bold tabular-nums",
                    vsColorClass(kpis.vsLastMonth.label)
                  )}
                >
                  {kpis.vsLastMonth.label === "BETTER" ? (
                    <TrendingUpIcon className="size-4 shrink-0" />
                  ) : kpis.vsLastMonth.label === "WORSE" ? (
                    <TrendingDownIcon className="size-4 shrink-0" />
                  ) : null}
                  {kpis.vsLastMonth.delta >= 0
                    ? `+${formatCurrency(kpis.vsLastMonth.delta)}`
                    : formatCurrency(kpis.vsLastMonth.delta)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{monthLabel}</p>
              </>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </CardContent>
          <CardFooter>
            {kpis.vsLastMonth ? (
              <span className={cn("text-xs font-semibold", vsColorClass(kpis.vsLastMonth.label))}>
                {VS_LABELS[kpis.vsLastMonth.label]}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No prior data</span>
            )}
          </CardFooter>
        </Card>
      </Tooltip>
    </div>
  );
}
