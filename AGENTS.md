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
pnpm db:push   # apply Drizzle schema changes to D1
```

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

## Key Constraints

- TypeScript configs must use fully qualified paths: `@repo/typescript-config/base.json`
- Do NOT add `WebWorker` to tsconfig — types come from `worker-configuration.d.ts` or `@cloudflare/workers-types`
- Use `bun turbo -F` for build/test/deploy; use `pnpm -F` for dependency management
- CI runs on branches; deploy happens automatically on merge to `main` via GitHub Actions (`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets required)
