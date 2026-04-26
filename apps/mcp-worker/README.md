# pnl-mcp-worker

Read-only MCP server that exposes Personal P&L data to AI agents. The server is
backed by the same D1 database as the tRPC Worker, but it has no write tools —
all categorization and upload paths remain on the tRPC Worker so there is a
single write path through the system.

## Endpoints

| Path      | Description                             |
| --------- | --------------------------------------- |
| `/health` | Liveness probe — returns `{ ok: true }` |
| `/sse`    | MCP over Server-Sent Events             |
| `/mcp`    | MCP over Streamable HTTP                |

## Tools

### Reporting (LAG-15)

- `ping` — confirms D1 binding and shared schema reachability.
- `get_pnl_report` — full P&L for a calendar year with monthly breakdown and YTD totals.
- `get_monthly_pnl` — single-month P&L with category-level breakdown.
- `get_savings_rate` — savings rate for a month or year, plus HEALTHY/WATCH/DANGER label.
- `get_ytd_summary` — current-year YTD income / expenses / net / avg savings rate.
- `get_transactions` — individual rows (filterable by month, category, uncategorized).
- `get_spending_by_category` — DEBIT totals per FIXED/VARIABLE category for a month.
- `get_top_merchants` — top merchants by total amount, grouped by normalized description.
- `search_transactions` — substring search on description.

### Advisor context (LAG-16)

These tools are designed to give an agent enough synthesized context and
benchmarks to give actionable advice without manually computing ratios or
fetching multiple data points.

#### `get_financial_health_snapshot`

No input. Returns:

```json
{
  "month": "2026-04",
  "net": 1234.56,
  "netLabel": "IN_THE_GREEN",
  "savingsRate": 0.27,
  "savingsLabel": "HEALTHY",
  "biggestExpense": { "name": "Rent", "total": 2400 },
  "vsLastMonth": { "delta": 320.5, "label": "BETTER" },
  "data_quality": { "uncategorized_count": 0, "uncategorized_pct": 0, "warning": false }
}
```

Mirrors the four KPI cards from TICKET-012 as a single structured object so
the agent can answer "how am I doing?" in one round trip.

#### `get_budget_variance`

Input: `{ "month": "YYYY-MM" }`. For every FIXED and VARIABLE category that has
activity in the trailing 3 months or the requested month, returns the trailing
3-month average vs the actual spend, the variance, and a status label:

- `OVER` — actual exceeds the trailing average by more than 10%.
- `UNDER` — actual is more than 10% below the trailing average.
- `ON_TRACK` — within ±10% of the average.

Rows are sorted by absolute variance descending so the biggest deviations
come first.

#### `get_cashflow_trend`

Input: `{ "months": number }` (default `6`, max `24`). Returns trailing
monthly cashflow:

```json
{
  "months": [
    { "month": "2025-11", "income": 7500, "expenses": 6200, "net": 1300 },
    { "month": "2025-12", "income": 7500, "expenses": 7900, "net": -400 }
  ],
  "data_quality": { ... }
}
```

`IGNORED` transactions are excluded so `net` reflects real cashflow.

#### `get_category_list`

No input. Returns every category as `{ id, name, group_type, color }` so the
agent can refer to categories by their exact UI name in recommendations.

## Data quality block

Every advisor tool includes:

```ts
data_quality: {
  uncategorized_count: number,
  uncategorized_pct: number,
  warning: boolean // true when uncategorized_pct > 5
}
```

`uncategorized_pct` is computed against the transactions that fall inside the
period the tool analysed (current month for the snapshot, trailing 4 months
for budget variance, the requested window for cashflow trend, all-time for
the category list). When `warning` is `true`, the agent should qualify its
analysis — totals may be incomplete because uncategorized transactions are
excluded from group rollups.

## Suggested system prompt for consuming agents

Copy-paste the block below into the system prompt of any agent that uses this
MCP server. It teaches the model when to call which tool.

```
You are a financial advisor for the user's Personal P&L. You have read-only
access to their full transaction history and synthesized financial context
through the pnl-mcp-worker MCP server. You cannot create, edit, or
recategorize transactions — direct the user to the web app for those changes.

When the user asks an open question about their finances, follow this plan:

1. Call `get_financial_health_snapshot` first. Use the response to give a
   one-sentence top-line answer (net + savings rate + how it compares to last
   month).

2. If the user wants to know *why* a number moved or where to cut back, call
   `get_budget_variance` for the current month. Lead with the 1–3 categories
   with the largest absolute variance and concrete numbers (trailing average,
   actual, delta).

3. If the user asks about trends, runway, or "how have things changed", call
   `get_cashflow_trend` (default 6 months, up to 24). Describe the direction of
   net cashflow and any month with negative net.

4. Before recommending a category change, call `get_category_list` once per
   conversation and use the exact `name` from that list when referring to
   categories.

5. For drill-downs into a specific merchant or month, fall back to the
   reporting tools: `get_spending_by_category`, `get_top_merchants`,
   `get_transactions`, `search_transactions`.

Every advisor tool returns a `data_quality` block. If `warning` is true, open
your response with a short caveat — for example: "Heads up: 12% of
transactions in this period are uncategorized, so the totals below may be
low." Then continue with the analysis.

Style: precise, composed, personal. Cite numbers with currency and signs.
Recommend at most 2–3 specific actions per response, each tied to a category
name from `get_category_list`.
```
