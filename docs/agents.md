# Agent Guide

Guidance for AI agents (Claude, Cursor, etc.) working on this codebase.

## Tech context

- **Frontend**: React + Vite SPA at `apps/web/`, port 5173
- **Backend**: Hono + tRPC Cloudflare Worker at `apps/worker/`, port 8787
- **Database**: Cloudflare D1 (SQLite) via Drizzle ORM, schema in `packages/types/src/schema.ts`
- **Shared types**: `packages/types/` — Drizzle table types, Zod schemas, and `AppRouter` for tRPC
- **Routing**: TanStack Router (file-based) — routes live in `apps/web/src/routes/`
- **Data fetching**: tRPC + TanStack Query — client at `apps/web/src/lib/trpc.ts`

## UI: shadcn/ui

This project uses [shadcn/ui](https://ui.shadcn.com) with Tailwind CSS v4.

- Components are source files in `apps/web/src/components/ui/` — edit them directly when needed.
- Add a component: `cd apps/web && pnpm dlx shadcn@latest add <component-name>`
- The `cn()` utility is at `apps/web/src/lib/utils.ts` — always use it for conditional class merging.
- Import alias `@/` maps to `apps/web/src/`, so `import { Button } from '@/components/ui/button'`.
- Theme is defined via CSS variables in `apps/web/src/index.css` (oklch format, Tailwind v4).
- Configuration is in `apps/web/components.json` — style: `base-nova`, baseColor: `neutral`.

## Monetary Arithmetic — Always Use Decimal.js

**Never use raw `+`, `-`, `*`, `/` on monetary values.** JavaScript binary floating-point produces silent errors (`0.1 + 0.2 !== 0.3`) that corrupt P&L totals and savings rates.

All monetary computation lives in `packages/engine` (`@pnl/engine`):

| What | Where |
|---|---|
| Helper functions (`add`, `subtract`, `multiply`, `divide`, `safeDivide`, `toStorable`, `toDisplay`) | `packages/engine/src/money.ts` |
| P&L types (`PnlInput`, `PnlResult`) | `packages/engine/src/types/index.ts` |
| P&L computation (`computePnl`) | `packages/engine/src/pnl.ts` |

**Rules:**
- Import and use `add()`, `subtract()`, etc. from `@pnl/engine` — never operate on raw numbers directly.
- `safeDivide(numerator, denominator)` returns `null` when denominator is zero — handle the null (no division-by-zero crashes).
- Before writing to D1 call `toStorable(decimal)` → returns a plain `number` rounded to 2 decimal places.
- After reading from D1 wrap in `new Decimal(value)` before any arithmetic.
- `toDisplay(decimal)` formats as MXN currency string — use this for all UI display.
- Do not mix raw JS arithmetic and Decimal within the same calculation chain.

## tRPC AppRouter

`AppRouter` is defined in `packages/types/src/trpc.ts` (context-free, for type safety in the web app).  
The worker has its own matching router in `apps/worker/src/trpc/router.ts` (with D1 context).  
**When adding a new tRPC procedure, update both files to keep the types in sync.**

## Path aliases

| Alias | Resolves to |
|---|---|
| `@/*` (in web) | `apps/web/src/*` |
| `@pnl/types` | `packages/types/src` |

## Commands

```bash
just dev         # Start web (5173) + worker (8787) concurrently
just check       # Lint + type-check + format
pnpm db:push     # Apply Drizzle schema changes to D1
```
