import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { McpAgent } from "agents/mcp";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

import * as schema from "@pnl/types";
import { computeMonthlyPnl, computePnlReport, getSavingsRateBenchmark, monthFilterSchema } from "@pnl/types";

const validator = new CfWorkerJsonSchemaValidator();

function jsonText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
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
