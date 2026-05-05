import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { McpAgent } from "agents/mcp";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import * as schema from "@pnl/types";
import {
  computeMonthlyPnl,
  computePnlReport,
  getBudgetVariance,
  getCashflowTrend,
  getCategoryList,
  getFinancialHealthSnapshot,
  getSavingsRateBenchmark,
  getSpendingByCategory,
  getTagReportByName,
  getTopMerchants,
  listTagNames,
  listTransactions,
  mcpBudgetVarianceInputSchema,
  mcpCashflowTrendInputSchema,
  mcpGetTransactionsInputSchema,
  mcpSearchTransactionsInputSchema,
  mcpSpendingByCategoryInputSchema,
  mcpTopMerchantsInputSchema,
  monthFilterSchema,
  searchTransactions
} from "@pnl/types";

const validator = new CfWorkerJsonSchemaValidator();

function jsonText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function formatDateRange(range: { from: string; to: string } | null): string {
  if (!range) return "unknown";
  const f = new Date(range.from + "T00:00:00Z");
  const t = new Date(range.to + "T00:00:00Z");
  const fm = MONTH_NAMES[f.getUTCMonth()]!,
    fd = f.getUTCDate(),
    fy = f.getUTCFullYear();
  const tm = MONTH_NAMES[t.getUTCMonth()]!,
    td = t.getUTCDate(),
    ty = t.getUTCFullYear();
  if (fy === ty && fm === tm) return `${fm} ${fd} – ${td}, ${fy}`;
  if (fy === ty) return `${fm} ${fd} – ${tm} ${td}, ${fy}`;
  return `${fm} ${fd}, ${fy} – ${tm} ${td}, ${ty}`;
}

function uncategorizedWarning(count: number, period: string): string | undefined {
  if (count === 0) return undefined;
  const noun = count === 1 ? "transaction" : "transactions";
  return `${count} uncategorized ${noun} in ${period} — totals may be incomplete.`;
}

export class PnLMcp extends McpAgent<Env> {
  server = new McpServer({ name: "pnl-mcp-worker", version: "0.1.0" }, { jsonSchemaValidator: validator });

  async init() {
    this.server.registerTool(
      "ping",
      {
        description: "Liveness probe: confirms the MCP worker can reach its D1 binding and read the shared schema."
      },
      async () => {
        const db = drizzle(this.env.DB, { schema });
        const count = await db.$count(schema.categories);
        return {
          content: [{ type: "text", text: `pong (categories=${count})` }]
        };
      }
    );

    this.server.registerTool(
      "get_pnl_report",
      {
        description:
          "Return the full P&L report for a calendar year. For each month it includes income, fixed expenses, " +
          "variable expenses, ignored transfers, net (income − expenses), and savings rate, plus year-to-date totals " +
          "and the average monthly savings rate. Use this when the user asks about a whole year or wants to compare " +
          "months side by side.",
        inputSchema: { year: z.number().int().min(2000).max(2100) }
      },
      async ({ year }) => {
        const db = drizzle(this.env.DB, { schema });
        const report = await computePnlReport(db, year);
        return jsonText({
          ...report,
          warning: uncategorizedWarning(report.uncategorizedCount, String(year))
        });
      }
    );

    this.server.registerTool(
      "get_monthly_pnl",
      {
        description:
          "Return a single month's P&L with category-level breakdown — income, fixed expenses, variable expenses, " +
          "ignored transfers, net, and savings rate. Use this when the user asks about one specific month, e.g. " +
          "'how did I do in March 2025?'. Month must be formatted as YYYY-MM.",
        inputSchema: { month: monthFilterSchema }
      },
      async ({ month }) => {
        const db = drizzle(this.env.DB, { schema });
        const { pnl, uncategorizedCount } = await computeMonthlyPnl(db, month);
        return jsonText({
          ...pnl,
          uncategorizedCount,
          warning: uncategorizedWarning(uncategorizedCount, month)
        });
      }
    );

    this.server.registerTool(
      "get_savings_rate",
      {
        description:
          "Return the savings rate for either a single month or a calendar year, plus a benchmark label " +
          "(HEALTHY when ≥ 20%, WATCH when ≥ 10%, DANGER when < 10%). Provide exactly one of `month` (YYYY-MM) " +
          "for that month, or `year` (number) for the average monthly savings rate across that year. When there " +
          "is no income in the period, savings rate and benchmark are both null.",
        inputSchema: {
          month: monthFilterSchema.optional(),
          year: z.number().int().min(2000).max(2100).optional()
        }
      },
      async ({ month, year }) => {
        if ((month && year !== undefined) || (!month && year === undefined)) {
          return {
            content: [{ type: "text", text: "Provide exactly one of `month` (YYYY-MM) or `year` (number)." }],
            isError: true
          };
        }
        const db = drizzle(this.env.DB, { schema });
        if (month) {
          const { pnl, uncategorizedCount } = await computeMonthlyPnl(db, month);
          return jsonText({
            scope: "month" as const,
            period: month,
            savingsRate: pnl.savingsRate,
            benchmark: getSavingsRateBenchmark(pnl.savingsRate),
            warning: uncategorizedWarning(uncategorizedCount, month)
          });
        }
        const report = await computePnlReport(db, year as number);
        return jsonText({
          scope: "year" as const,
          period: String(year),
          savingsRate: report.avgMonthlySavingsRate,
          benchmark: getSavingsRateBenchmark(report.avgMonthlySavingsRate),
          warning: uncategorizedWarning(report.uncategorizedCount, String(year))
        });
      }
    );

    this.server.registerTool(
      "get_ytd_summary",
      {
        description:
          "Return a year-to-date summary for the current calendar year: total income, total expenses, net " +
          "(income − expenses), and the average monthly savings rate with a HEALTHY/WATCH/DANGER benchmark label. " +
          "No input required. Use this for quick 'how am I doing this year so far?' questions."
      },
      async () => {
        const db = drizzle(this.env.DB, { schema });
        const year = new Date().getUTCFullYear();
        const report = await computePnlReport(db, year);
        return jsonText({
          year,
          ytdIncome: report.ytdIncome,
          ytdExpenses: report.ytdExpenses,
          ytdNet: report.ytdNet,
          avgMonthlySavingsRate: report.avgMonthlySavingsRate,
          savingsBenchmark: getSavingsRateBenchmark(report.avgMonthlySavingsRate),
          warning: uncategorizedWarning(report.uncategorizedCount, String(year))
        });
      }
    );

    this.server.registerTool(
      "get_transactions",
      {
        description:
          "Return individual transactions with optional filters: `month` (YYYY-MM), `categoryId` (number), or " +
          "`uncategorized: true` to find transactions still missing a category. Each row includes id, date, " +
          "description, amount (positive number), type (DEBIT or CREDIT), categoryId, and categoryName. " +
          "Results are ordered newest-first. Default limit is 50, max 200 — make targeted queries.",
        inputSchema: mcpGetTransactionsInputSchema.shape
      },
      async (input) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await listTransactions(db, input);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "get_spending_by_category",
      {
        description:
          "Return total spend per FIXED and VARIABLE category for a single month, sorted by amount descending. " +
          "Income and ignored transfers are excluded; CREDIT entries (e.g. refunds) are not counted. Use this when " +
          "the user asks 'where did my money go in <month>?'. Month must be YYYY-MM.",
        inputSchema: mcpSpendingByCategoryInputSchema.shape
      },
      async ({ month }) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getSpendingByCategory(db, month);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "get_top_merchants",
      {
        description:
          "Return the top merchants by total amount, grouped by normalized description (uppercased + trimmed). " +
          "Each row has merchant (the normalized name), count (number of transactions), and total. Optional " +
          "`month` filter (YYYY-MM). Default limit is 10, max 200. Use this for 'where do I spend the most?' " +
          "questions.",
        inputSchema: mcpTopMerchantsInputSchema.shape
      },
      async (input) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getTopMerchants(db, input);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "search_transactions",
      {
        description:
          "Find transactions whose description contains `query` (case-insensitive substring match). Optional " +
          "`month` filter (YYYY-MM). Returns the same row shape as get_transactions, ordered newest-first. " +
          "Default limit is 50, max 200. Use this when the user names a specific merchant or keyword.",
        inputSchema: mcpSearchTransactionsInputSchema.shape
      },
      async (input) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await searchTransactions(db, input);
        return jsonText({ rows: result });
      }
    );

    this.server.registerTool(
      "get_financial_health_snapshot",
      {
        description:
          "Return a synthesized snapshot of the user's current financial health for the current calendar month: " +
          "net (income − expenses) with IN_THE_GREEN/IN_THE_RED/NEUTRAL label, savings rate with " +
          "HEALTHY/WATCH/DANGER benchmark, the single biggest expense category, and the delta in net vs the " +
          "previous month with BETTER/WORSE/SAME label. Use this as the FIRST call when the user asks an " +
          "open-ended 'how am I doing?' question — it lets you give an immediate top-line answer without " +
          "stitching together multiple queries. Includes a `data_quality` block; warn the user when " +
          "`warning: true` because totals may be incomplete."
      },
      async () => {
        const db = drizzle(this.env.DB, { schema });
        const snapshot = await getFinancialHealthSnapshot(db);
        return jsonText(snapshot);
      }
    );

    this.server.registerTool(
      "get_budget_variance",
      {
        description:
          "Return per-category budget variance for the requested month: each FIXED and VARIABLE category " +
          "with its trailing 3-month average (the user's implicit budget), the actual spend in `month`, the " +
          "difference, and a status label — OVER if actual exceeds the average by more than 10%, UNDER if it " +
          "falls below by more than 10%, otherwise ON_TRACK. Rows are sorted by absolute variance descending " +
          "so the biggest deviations come first. Use this to identify which categories are driving over- or " +
          "under-spending and to recommend specific corrective action by category. Month must be YYYY-MM. " +
          "Includes a `data_quality` block covering the trailing 3 months plus the requested month.",
        inputSchema: mcpBudgetVarianceInputSchema.shape
      },
      async ({ month }) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getBudgetVariance(db, month);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "get_cashflow_trend",
      {
        description:
          "Return monthly cashflow for the trailing N calendar months as an array of " +
          "`{ month, income, expenses, net }`, oldest first. `months` defaults to 6 and is capped at 24. " +
          "IGNORED transfers are excluded so net reflects real cashflow. Use this to spot multi-month trends " +
          "(e.g. expenses creeping up, income volatility, persistent negative net) and to ground recommendations " +
          "in the user's recent trajectory rather than a single month. Includes a `data_quality` block covering " +
          "the requested window.",
        inputSchema: mcpCashflowTrendInputSchema.shape
      },
      async ({ months }) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getCashflowTrend(db, months);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "get_category_list",
      {
        description:
          "Return every category configured in the system as `{ id, name, group_type, color }`, ordered as " +
          "they appear in the UI. `group_type` is one of INCOME, FIXED, VARIABLE, IGNORED. Use this so you " +
          "can refer to categories by their exact name when giving advice (e.g. 'cut Dining Out by 20%') and " +
          "to confirm which categories exist before suggesting changes. Includes a `data_quality` block " +
          "computed across all transactions so you can warn the user when categorization coverage is poor."
      },
      async () => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getCategoryList(db);
        return jsonText(result);
      }
    );

    this.server.registerTool(
      "get_tag_report",
      {
        description:
          "Get a full spend report for a named tag (e.g. 'New York 2026'). Use this to answer questions " +
          "about the cost of trips, projects, or events. Supports partial and case-insensitive name matching.",
        inputSchema: { tag_name: z.string().trim().min(1) }
      },
      async ({ tag_name }) => {
        const db = drizzle(this.env.DB, { schema });
        const result = await getTagReportByName(db, tag_name);

        if (!result) {
          const availableTags = await listTagNames(db);
          return jsonText({
            error: `No tag matches "${tag_name}". Use one of the available tags or a partial name.`,
            available_tags: availableTags
          });
        }

        const { report, availableTags } = result;
        return jsonText({
          matched_tag: report.tag.name,
          date_range: formatDateRange(report.dateRange),
          total_spend: report.totalSpend,
          total_income: report.totalIncome,
          net: report.net,
          by_category: report.byCategory.map((c) => ({
            name: c.categoryName,
            group: c.groupType,
            total: c.total
          })),
          transaction_count: report.transactions.length,
          available_tags: availableTags
        });
      }
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, name: "pnl-mcp-worker" });
    }
    if (url.pathname.startsWith("/sse")) {
      return PnLMcp.serveSSE("/sse").fetch(request, env, ctx);
    }
    if (url.pathname.startsWith("/mcp")) {
      return PnLMcp.serve("/mcp").fetch(request, env, ctx);
    }
    return new Response("Not found", { status: 404 });
  }
};
