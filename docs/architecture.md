**Personal P&L**

Tech Stack & Architecture Decision Log

Version 1.0 · March 2026

**1. Project Overview**

Personal P&L applies professional financial analysis --- specifically
the Profit & Loss statement and Free Cash Flow statement --- to personal
finances. The goal is to give an individual the same analytical rigour
that a CFO applies to a company\'s finances.

The MVP scope covers: CSV bank statement ingestion, manual transaction
categorization, and a monthly P&L view with key financial health
indicators.

**2. Final Technology Stack**

  ---------------------------------------------------------------------------
  **Layer**        **Technology**   **Rationale**         **Alternative
                                                          Considered**
  ---------------- ---------------- --------------------- -------------------
  **Frontend**     React + Vite     No SSR needed for     TanStack Start
                   (SPA)            personal tool. Simple (beta --- too risky
                                    deploy to CF Pages.   for financial tool)
                                    Stable,
                                    well-documented.

  **Routing**      TanStack Router  File-based routing,   React Router v7
                                    type-safe links,
                                    integrates with
                                    TanStack Query
                                    natively.

  **Data           TanStack Query + End-to-end type       GraphQL + Apollo
  Fetching**       tRPC             safety without code   (overkill for fixed
                                    generation. Query     query shapes)
                                    caching built in.

  **API Layer**    Hono on CF       Lightweight,          Express / Fastify
                   Workers          edge-native,          (not
                                    excellent TypeScript  edge-compatible)
                                    support. tRPC mounts
                                    as middleware.

  **Database**     Cloudflare D1    Native to CF Workers. PlanetScale /
                   (SQLite)         Free tier generous.   Supabase (external,
                                    Sufficient for        adds latency)
                                    personal-scale
                                    analytics.

  **ORM**          Drizzle ORM      Edge-native from day  Prisma (D1 adapter
                                    one. D1 support is    is bolt-on, heavy
                                    first-class. Schema   bundle, no
                                    is TypeScript.        transactions)
                                    Lightweight bundle.

  **Validation**   Zod              Single schema defines Yup / Valibot
                                    types for server fn
                                    input, DB writes, and
                                    frontend forms. One
                                    source of truth.

  **UI             shadcn/ui +      Copy-paste            Tremor
  Components**     Tailwind         components, full      (inconsistent
                                    control, consistent   maintenance), MUI
                                    design system. Not a  (too heavy)
                                    black-box library.

  **Charts**       shadcn/charts    Already in the shadcn Tremor charts, Nivo
                   (Recharts)       design system. Zero   (extra deps)
                                    extra dependency.
                                    Actively maintained.

  **Monorepo**     Turborepo + pnpm Build caching, fast   Nx (too heavy), npm
                                    installs, low         workspaces (no
                                    configuration         caching)
                                    overhead for a solo
                                    project.

  **CSV Parsing**  Papa Parse       Handles encoding,     Server-side parsing
                   (client-side)    delimiters, quoted    (unnecessary
                                    fields. Keeps Worker  complexity)
                                    lean --- no multipart
                                    complexity.

  **Deployment**   CF Pages (web) + Proven architecture.  Vercel + separate
                   CF Workers (API) Each piece does one   API (two platforms
                                    job. Well-documented  to manage)
                                    CF pattern.
  ---------------------------------------------------------------------------

**3. Architecture Decision Records**

Each ADR below documents a decision that was actively debated, the
alternatives considered, and the rationale for the final choice.

**ADR-001: Framework --- TanStack Start vs React + Vite SPA**

Decision date: March 2026 · Status: Accepted

TanStack Start was the initial preference due to its native TanStack
Query integration and server function support that would mirror tRPC\'s
type-safety. However, it was rejected for the following reasons:

-   TanStack Start remains in beta as of early 2026 with documented
    breaking changes between versions.

-   The Cloudflare Workers adapter is new and under-tested at the
    intersection of D1 + Drizzle + Start.

-   A personal finance tool requires reliability over novelty ---
    debugging framework issues on a beta is a poor use of time.

-   SSR provides no meaningful benefit for a single-user personal
    dashboard. There is no SEO requirement, no cold-load performance
    constraint, and no public audience.

React + Vite SPA was chosen. TanStack Router provides file-based routing
and type-safe navigation. TanStack Query handles all data fetching and
caching. The frontend is deployed as a static asset to Cloudflare Pages.

**ADR-002: ORM --- Prisma vs Drizzle**

Decision date: March 2026 · Status: Accepted

Prisma is the more familiar and widely-used ORM but has significant
friction on Cloudflare Workers:

-   Prisma\'s D1 support is via a driver adapter --- a bolt-on, not a
    first-class integration.

-   Interactive transactions (\$transaction) are not supported on D1 via
    Prisma.

-   Prisma Client is heavy --- bundle size is a real constraint in
    Workers which have a 1MB compressed limit.

-   Migrations via prisma migrate are awkward with D1\'s apply workflow.

Drizzle was chosen because it was built for the edge from day one. The
schema is defined in TypeScript (no separate .prisma file). D1 support
is native, not adapted. Full transaction support is available. The
bundle is lightweight. drizzle-kit push simplifies migrations
significantly.

**ADR-003: API Type Safety --- tRPC vs GraphQL vs REST**

Decision date: March 2026 · Status: Accepted

  ------------------------------------------------------------------------
  **Option**       **Pros**           **Cons**           **Verdict**
  ---------------- ------------------ ------------------ -----------------
  GraphQL          Flexible queries,  Schema + resolver  **Rejected**
                   mature ecosystem   layer, N+1
                                      problems, Apollo
                                      bundle weight,
                                      massive overkill
                                      for fixed query
                                      shapes

  REST + OpenAPI   Simple,            No end-to-end type **Rejected for
                   universally        safety without     MVP**
                   consumable, good   codegen, manual
                   for third-party    type maintenance
                   exposure

  tRPC             End-to-end types   Slightly harder to **Accepted**
                   with zero codegen, consume from
                   router IS the      non-TypeScript
                   contract,          clients
                   integrates with
                   Hono cleanly
  ------------------------------------------------------------------------

tRPC was chosen. The AppRouter type exported from the Worker is the
single source of truth. The frontend imports only the type --- no
runtime Worker code lands in the browser bundle. Type errors surface at
compile time across the entire stack.

**ADR-004: Charts --- Tremor vs shadcn/charts vs Nivo**

Decision date: March 2026 · Status: Accepted

-   Tremor was the initial recommendation for its financial chart
    aesthetic, but was rejected. Tremor underwent a major v3 rewrite
    that introduced breaking changes and has had inconsistent
    maintenance cadence.

-   Nivo produces beautiful charts but adds a significant bundle
    dependency with no design system alignment.

-   shadcn/charts was chosen. It is built on Recharts (the most widely
    used React charting library), ships within the shadcn design system,
    is actively maintained, and adds zero additional npm dependencies
    beyond what shadcn already requires.

**ADR-005: Database --- D1 vs External Postgres**

Decision date: March 2026 · Status: Accepted

D1 (SQLite at the edge) was chosen over external Postgres options
(PlanetScale, Supabase, Neon) for the following reasons:

-   D1 is natively bound to Cloudflare Workers --- no network hop, no
    connection pooling, no credentials to manage.

-   SQLite\'s analytical query capabilities (GROUP BY, SUM, date
    functions) are fully sufficient for personal-scale P&L computation
    --- tens of thousands of transactions at most.

-   The free tier covers all MVP usage with no billing risk.

-   The edge latency benefit of external Postgres is irrelevant for a
    single-user personal tool.

Known limitations of D1 to monitor: no full-text search, SQLite type
flexibility can cause subtle bugs (mitigated by Drizzle\'s strict
types), and complex analytical queries on very large datasets may be
slow. None of these are concerns at personal scale.

**4. Type Safety Architecture**

The entire stack shares types through a single lineage with no manual
synchronisation required:

+-----------------------------------------------------------------------+
| **packages/types/schema.ts (Drizzle schema)**                         |
|                                                                       |
| → Drizzle generates TypeScript types for all tables                   |
|                                                                       |
| → Zod schemas in packages/types validate all inputs                   |
|                                                                       |
| → tRPC AppRouter exported from Worker                                 |
|                                                                       |
| → Frontend imports AppRouter type only (no runtime Worker code)       |
|                                                                       |
| **→ TypeScript breaks loudly at compile time if shapes diverge**      |
+-----------------------------------------------------------------------+

**5. Local Development**

The app is designed to run entirely locally with remote Cloudflare
bindings. No auth is required for MVP --- this is a single-user personal
tool.

+-----------------------------------------------------------------------+
| \# Install dependencies                                               |
|                                                                       |
| **pnpm install**                                                      |
|                                                                       |
| \# Start web + worker concurrently (uses remote D1 binding)           |
|                                                                       |
| **pnpm dev**                                                          |
|                                                                       |
| \# Apply schema changes to D1                                         |
|                                                                       |
| **pnpm db:push**                                                      |
+-----------------------------------------------------------------------+

Wrangler is configured with \--remote flag so the local Worker process
connects directly to the real D1 database. This simplifies local
development --- no local SQLite file to manage, data persists across dev
sessions.

**6. Future Considerations**

**AI Categorization (V2)**

The Cloudflare AI Worker binding will be used for automatic transaction
categorization. The Cloudflare Agent SDK provides the scaffolding for
multi-step AI workflows. The category taxonomy defined in V1 (see Ticket
006) is intentionally structured to serve as the classification target
for the AI model.

**Free Cash Flow Statement (V2)**

FCF = Net Income minus capital expenditure. Personally, this means net
income minus any large one-time purchases or investment contributions.
The IGNORED category and the existing transaction schema already support
this --- it requires only a new computation endpoint and view.

**Multi-Account Support (V3)**

The source_file field on transactions and the column_mappings table are
designed with multi-account support in mind. Adding an accounts table
and an account_id foreign key on transactions is the only schema change
required.

**Authentication (V3)**

Cloudflare Access provides zero-config authentication for Workers. For a
personal tool shared with a partner or advisor, adding CF Access in
front of the Worker requires no application code changes.
