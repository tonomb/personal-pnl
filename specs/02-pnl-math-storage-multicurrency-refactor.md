# Spec: P&L math & storage refactor — cents, multi-currency FX, layered packages

**Status:** ready-for-agent
**Branch:** `claude/pnl-math-corr-architecture-qreyqg`
**References:** ADR-0001…0004 (`docs/adr/`), glossary (`CONTEXT.md`), LAG-46

> Note: publishing this spec to Linear (team LAG) was blocked by MCP approval in the
> authoring session; this file is the canonical copy until it's mirrored there.

## Problem Statement

As the owner of my Personal P&L, I can't fully trust the numbers or safely evolve the app:

- Money is stored as floating-point and summed as floats in SQL; a decimal library patches precision after the fact. Ingestion accepts arbitrary-precision amounts.
- All of my accounts are treated as one currency, while the UI formats USD and the money package formats MXN. I hold accounts in more than one currency, and today their statements would silently sum together as if they were the same unit.
- Refunds have no defined meaning: a refund into an expense category _inflates_ spend.
- The "direction comes from the category, not the bank type" rule (LAG-46) is applied in some reports but not others (spending-by-category, tag report totals, budget variance), so different screens disagree about the same data.
- The P&L math itself is duplicated and scattered: the monthly rollup query exists four times, KPI derivation twice, the tag report builder twice verbatim, and a dead "engine" package still contains the pre-LAG-46 buggy math waiting to be reused. Savings rates are quantized to whole percents by 2dp rounding.

## Solution

One coherent refactor, already grilled and decided:

- **Exact money**: transactions store positive integer cents (AmountCents) in the account's currency; every aggregation is integer math; the API and UI keep major units (≤2dp). Refunds are income by convention (a default "Refunds" INCOME category).
- **Multi-currency done honestly**: each Account carries a currency; reports convert to a user-chosen Base Currency using a manually maintained monthly FX-rate table keyed by currency pair; a missing rate is a hard, structured error — totals are never silently wrong.
- **One home per concern**: schema/contract types, pure P&L math, and data access live in three separate packages with one-way dependencies; both the API worker and the MCP worker are thin callers. Every money aggregate is a pure fold over one "Rollup Cell" row shape produced by a single converted-rollup module.
- **Consistency fixes**: direction-from-category applied everywhere (tag totals, spending by category, budget variance); rates round to 4dp.

## User Stories

1. As the app owner, I want transaction amounts stored as integer cents, so that sums are exact no matter how many statements I import.
2. As the app owner, I want the API and UI to keep showing major-unit amounts, so that nothing I read changes meaning after the migration.
3. As the app owner, I want upload to accept the amounts exactly as parsed from my CSV (major units) and normalize them server-side, so that ingestion is the only place precision is decided.
4. As the app owner, I want each account to declare its currency, so that statements from my USD card and MXN bank don't mix units.
5. As the app owner, I want every report converted into my base currency, so that a single P&L covers all my accounts.
6. As the app owner, I want to choose my base currency in settings, so that I can report in MXN today and switch later without corrupting stored rates.
7. As the app owner, I want to maintain monthly FX rates per currency pair, so that each month's transactions convert at that month's rate and corrections recompute history.
8. As the app owner, I want reports to fail loudly with the exact missing (month, currency) pairs when a rate is absent, so that I'm never shown silently wrong totals.
9. As the app owner, I want to manage FX rates and the base currency through the API/MCP advisor, so that a missing rate is a one-message fix.
10. As the app owner, I want a default "Refunds" income category, so that returned purchases raise income instead of inflating spend.
11. As the app owner, I want tag reports, spending-by-category, and budget variance to follow the same direction-from-category rule as the P&L, so that every screen agrees about the same transactions.
12. As the app owner, I want savings rates kept at 4-decimal precision, so that "75.6%" doesn't display as "76.0%".
13. As the app owner, I want transaction lists to show each row's original currency, so that raw statement views stay honest and unconverted.
14. As the app owner, I want aggregate responses to state which currency they're denominated in, so that the UI always formats with the right symbol.
15. As the MCP advisor user, I want every advisor tool (health snapshot, budget variance, cashflow trend, card optimization) computed from the same converted rollup as the web P&L, so that chat answers match the dashboard.
16. As the developer, I want all pure P&L math in one engine package with no database imports, so that every business rule is testable from fixtures.
17. As the developer, I want all SQL and FX conversion in one data-access package used by both workers, so that queries exist exactly once.
18. As the developer, I want the contract package to contain only schema, input schemas, and DTO types, so that consumers can depend on types without dragging in logic.
19. As the developer, I want the dead engine package's stale pre-LAG-46 math deleted, so that the bug can't be reintroduced by importing it.
20. As the developer, I want the web app to derive the router type from the real router instead of a hand-mirrored stub, so that the API contract can't drift (the stub has already drifted).
21. As the developer, I want the D1 bound-parameter batching rule encoded once in an ingestion module, so that upload/categorize/tag mutations stop hand-rolling chunk sizes and casts.
22. As the developer, I want the CSV export computed by the engine, so that the web tier stops re-implementing report sums with floats.
23. As the developer, I want KPI derivation to exist once and serve both the tRPC endpoint and the advisor snapshot, so that the two can't diverge.
24. As the app owner, I want existing data migrated (amount → cents, default currency/settings backfilled), so that the upgrade needs no manual data surgery even though a wipe is acceptable.

## Implementation Decisions

All decisions below were confirmed in a grilling session and recorded as ADRs 0001–0004 plus the project glossary (CONTEXT.md):

- **Integer-cents storage, major-unit API (ADR-0001)**: `amount_cents` positive integer magnitude; decimal library confined to the money utilities package; conversion to 2dp major units happens once at the read boundary.
- **Direction from category, not sign or bank type (ADR-0002)**: no signed amounts; bank DEBIT/CREDIT kept as provenance only; refunds are income via a seeded "Refunds" INCOME category. Applied consistently to tag totals, spending-by-category, and budget variance (these are deliberate behavior fixes).
- **Multi-currency (ADR-0003)**: `accounts.currency` (ISO code, default MXN); single-row `settings` table with user-chosen base currency; `fx_rates` table keyed by (month, base, currency); conversion at read time only; missing rate ⇒ structured hard error (tRPC PRECONDITION_FAILED carrying the missing pairs); no FX auto-fetch.
- **Package layering (ADR-0004)**: money → types (contract only) → engine (pure math, cents in / DTOs out) → db (data access + FX + report assembly) → apps. Both workers consume the db package.
- **Converted Rollup module**: one interface produces Rollup Cells (month × category × account, base cents, row counts); the eight money aggregates are pure engine folds over cells; FX loading/validation lives only here.
- **Router-type seam**: the web derives the AppRouter type from the worker's real router (type-only import); the hand-written router mirror is deleted.
- **Ingestion module**: dedupe + major-units→cents + D1 param-limit chunking behind one `insertTransactions` interface; a shared chunked-batch helper serves tag/categorize mutations.
- **Rates round to 4dp; money to 2dp.** Percent displays keep their existing 1dp formatting.
- **Aggregate DTOs gain a `currency` field; raw transaction rows carry their account's original currency.** Grouped/merchant aggregates return `{currency, rows}`.
- **Migration**: additive D1 migration converting `amount` to `amount_cents` (ROUND(amount×100)), adding currency/settings/fx tables and the Refunds seed row.

## Testing Decisions

Good tests exercise external behavior through a module's interface — never implementation details, never mocks. Three existing seams, no new ones:

1. **tRPC appRouter (primary)** — integration tests via router caller against real D1 (existing pattern in the worker's router tests): upload stores cents from major-unit input; duplicate detection; P&L report/month/KPIs correct across mixed-currency accounts; settings/fx-rates CRUD; missing-rate returns PRECONDITION_FAILED listing pairs; refund-categorized transactions raise income.
2. **Data-access functions (MCP paths)** — advisor tools, card optimization, tag reports, transaction queries called directly against real D1 (existing pattern in the worker's advisor/tags/transactions-query tests), including the direction-from-category behavior fixes.
3. **Engine pure interface** — unit tests over Rollup Cell fixtures (existing pattern from the old engine/card-optimization tests): monthly P&L incl. the LAG-46 case and refunds-as-income, KPI derivation, budget variance labels, cashflow shaping, card optimization math, CSV assembly, 4dp rate rounding.

## Out of Scope

- FX rate auto-fetch from any external API; rate suggestions.
- Per-transaction currency overrides (currency is per account).
- Per-currency report tabs or side-by-side multi-currency views.
- A web UI for managing FX rates and base currency (API/MCP only for now; UI is a follow-up).
- Renaming web-visible DTO fields or changing their units.
- Auth/multi-user; the settings table is single-row by design.

## Further Notes

- The engine consumes cells already converted to base cents and is completely currency-agnostic; it stamps the currency code onto DTOs.
- Conversion is applied per rollup cell and rounded to integer base cents before aggregation, so line items always reconcile with their totals.
- Uploading a foreign-currency statement intentionally breaks reports until that month's rate exists — this is the chosen contract, and the structured error is what makes it humane.
- Glossary terms (Transaction, AmountCents, Type-as-provenance, Direction, Group, Refund, Base Currency, FX Rate, Savings Rate, Rollup Cell) live in CONTEXT.md at the repo root; decisions in docs/adr/0001–0004.
