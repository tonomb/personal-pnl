# Package layering: types ← engine ← db ← apps

`@pnl/types` had accreted all DB queries and P&L math alongside the schema, and `@pnl/engine` was dead code with stale (pre-LAG-46) math. The packages now have one responsibility each, with dependencies flowing one way:

- `@pnl/money` — cents/rate utilities; decimal.js confined here
- `@pnl/types` — Drizzle schema + Zod input schemas + DTO types only (the contract)
- `@pnl/engine` — all pure P&L math; base-cents in, major-unit DTOs out; no drizzle imports
- `@pnl/db` — all data access, FX conversion, and report assembly
- `apps/*` — thin routers over `@pnl/db`

The engine is the only place P&L semantics live (the interface is the test surface); `@pnl/db` is the only place SQL and FX conversion live. Putting queries in a shared package (rather than in the worker) is deliberate: both the API worker and the MCP worker consume them.

The `AppRouter` type lives at the worker's seam (`pnl-api/router`, type-only import from the web) and is derived from the real router — the hand-mirrored router stub that previously lived in `@pnl/types` drifted from the implementation and was deleted.
