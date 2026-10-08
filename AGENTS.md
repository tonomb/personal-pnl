# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Personal P&L — a personal finance management app modeled after company P&L statements (and eventually Free Cash Flow). MVP scope: CSV bank statement ingestion, manual transaction categorization, and a monthly P&L view with key financial health indicators.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite (SPA) → deployed to CF Pages |
| Routing | TanStack Router (file-based, type-safe) |
| Data fetching | TanStack Query + tRPC |
| API | Hono on CF Workers (tRPC mounts as middleware) |
| Database | Cloudflare D1 (SQLite) |
| ORM | Drizzle ORM (edge-native, schema in TypeScript) |
| Validation | Zod (shared between server input, DB writes, and frontend forms) |
| UI | shadcn/ui + Tailwind |
| Charts | shadcn/charts (Recharts) |
| CSV parsing | Papa Parse (client-side) |

## Type Safety Architecture

Types flow in one direction with no manual sync required:

```
packages/types/schema.ts (Drizzle schema)
  → Drizzle infers TypeScript types for all tables
  → Zod schemas validate all inputs
  → tRPC AppRouter exported from Worker
  → Frontend imports AppRouter type only (no runtime Worker code in browser bundle)
```

The `AppRouter` type is the single contract between frontend and backend.

## Commands

```bash
just install          # Install dependencies
just dev              # Run dev servers (context-aware via bun runx dev)
just test             # Run all tests (bun vitest)
just build            # Build all workers (bun turbo build)
just check            # Check deps, lint, types, format
just fix              # Fix lint, format, workers-types
just deploy           # Deploy all workers
just new-worker       # Scaffold a new worker (alias: just gen)
just new-package      # Scaffold a new shared package

# Targeted commands
bun turbo -F <worker-name> dev      # Dev a specific worker
bun turbo -F <worker-name> test     # Test a specific worker
bun turbo -F <worker-name> deploy   # Deploy a specific worker
bun vitest path/to/test.test.ts     # Run a single test file

# Dependency management (pnpm only for this)
pnpm -F @repo/<package-name> add <dep>
```

For lint/type checking within a package: `cd` to the package directory, then `bun turbo check:types check:lint`.

## Monorepo Structure

Cloudflare Workers monorepo using **pnpm workspaces** + **Turborepo** + **Hono** framework.

- `apps/` — Deployable Cloudflare Worker applications, each with its own `wrangler.jsonc`
- `packages/` — Shared code:
  - `@repo/hono-helpers` — Hono middleware and utilities (error handling, logging, request data)
  - `@repo/tools` — Dev scripts; worker `package.json` scripts delegate here for consistency
  - `@repo/eslint-config`, `@repo/typescript-config` — Shared configs
  - `@repo/workspace-dependencies` — Pinned dependency versions via syncpack
- `turbo/` — `turbo gen` templates (`fetch-worker`, `fetch-worker-vite`)

### P&L package layering (ADR-0004)

Domain code is layered with one-way dependencies — `types ← engine ← db ← apps`:

- `@pnl/money` — cents/rate utilities; decimal.js is confined here (ADR-0001)
- `@pnl/types` — Drizzle schema + Zod input schemas + DTO types ONLY (the contract; no queries, no math)
- `@pnl/engine` — ALL pure P&L math; consumes base-cents Rollup Cells, emits major-unit DTOs; no drizzle imports
- `@pnl/db` — ALL data access: the converted-rollup query, FX conversion (hard error on missing rates, ADR-0003), report assembly, ingestion batching
- `apps/worker`, `apps/mcp-worker` — thin routers over `@pnl/db`

Money is stored as positive integer cents; the API stays in major units (ADR-0001). P&L direction comes from the category's group, never the bank DEBIT/CREDIT type (ADR-0002). See `CONTEXT.md` for the domain glossary and `docs/adr/` for the decisions.

### Worker structure

Each worker follows this pattern:
- `src/context.ts` — Typed `Env` (bindings) and `Variables` extending `SharedHonoEnv`/`SharedHonoVariables` from `@repo/hono-helpers`
- `src/<worker-name>.app.ts` — Hono app with middleware, error handler, and routes
- `src/test/integration/` — Integration tests
- `wrangler.jsonc` — Worker config with `nodejs_compat` flag

Logging uses `workers-tagged-logger` via `useWorkersLogger` middleware. Environment variables include `ENVIRONMENT` and `SENTRY_RELEASE` (overridden at deploy time).

## Code Style

- Tabs for indentation, spaces for alignment
- `import type` for type-only imports
- Import order: Built-ins → Third-party → `@repo/` → Relative
- Workspace deps use `workspace:*` protocol
- Unused variables prefixed with `_`

## Local Development

Dev runs with `--remote` flag — the local Worker connects directly to the real D1 database (no local SQLite file). No auth in MVP; it's a single-user personal tool.

```bash
just install   # install deps
just dev       # start web + worker concurrently (uses remote D1 binding)
pnpm db:generate   # generate a migration in packages/types/drizzle after editing the schema
pnpm db:push:local # apply migrations to a local D1 (what branch CI runs)
```

Migrations are applied to the remote D1 by CI on merge to `main` (`wrangler d1 migrations apply`, before the deploy). Commit the generated SQL and let CI apply it. Do NOT run `pnpm db:push` (`drizzle-kit push`) against the remote database — it changes the schema without recording the migration, so the next CI migration run fails.

## UI Components (shadcn)

The project uses shadcn with the `base-nova` style (configured in `apps/web/components.json`). Components are backed by `@base-ui/react` primitives — **not** Radix UI.

**Always use the shadcn CLI to add new components:**

```bash
cd apps/web && pnpm dlx shadcn@latest add <component-name>
```

Do NOT hand-write components from scratch. The CLI handles `@base-ui/react` wiring and Tailwind theming automatically. Existing components live in `apps/web/src/components/ui/`.

**Known @base-ui/react quirks:**
- `Progress.Root` children must be a render function `(formattedValue, value) => ReactNode` — render labels/values outside `<Progress>` instead
- `Select.Root` uses `onValueChange={(val) => ...}` where `val` is typed as the item's value type (string by default)
- `Checkbox.Root` supports `indeterminate` prop; use `onCheckedChange` (not `onChange`)

## Git Hooks

Never use `git commit --no-verify` or `git push --no-verify` — hooks must run to confirm everything works. If a hook fails, fix the issue rather than bypassing it.

## Agent skills

### Issue tracker

Issues live in Linear (workspace `somos-dev`, team `LAG`, project "Personal PNL"), not GitHub. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) — not yet created in Linear. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Key Constraints

- TypeScript configs must use fully qualified paths: `@repo/typescript-config/base.json`
- Do NOT add `WebWorker` to tsconfig — types come from `worker-configuration.d.ts` or `@cloudflare/workers-types`
- Use `bun turbo -F` for build/test/deploy; use `pnpm -F` for dependency management
- CI runs on branches (including a local dry run of the D1 migrations); on merge to `main` GitHub Actions applies pending D1 migrations and then deploys (gated on the `DEPLOY_ENABLED=true` repo variable; `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are secrets on the `production` GitHub environment; the token needs D1 Edit as well as Workers permissions)
