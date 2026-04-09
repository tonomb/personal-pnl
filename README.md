
# Personal P&L
**A Opinionated Open Source Operating System For Your Personal Finances**

## Backstory
For the past 5 years I have managed my personal finances in the same way I would manage the personal finances of a company. I have a very complicated Excel Sheet to track a Profit & Loss statement to run my personal finances like a company.

P&L are the gold standard for managing and tracking a companys finances why not take the same ideas and bring them over to personal finance.

We're now creating the product as a fully open-source project. The goal is to let you run the app yourself, for free, and use it to manage your own finances and eventually offer a hosted version of the app for a small monthly fee.

## Hosting
Primary ways to use the Personal P&L app:

**TBD**

1. Managed
2. Self-host

## Contributing
Email Me

# Workers Monorepo Template

This template provides a fully featured monorepo for managing multiple Cloudflare Workers.

## Why a Monorepo?

Managing multiple related services (like Cloudflare Workers) in separate repositories can become complex. A monorepo approach offers several advantages:

- **Simplified dependency management** - `pnpm workspaces` allow you to manage dependencies across all your workers and shared packages from a single place. The tool `syncpack` (configured via `.syncpackrc.cjs`) help keep versions consistent.
- **Code sharing and reuse** - Easily create and share common logic, types, and utilities between workers by placing them in the `packages/` directory. Changes to shared code are immediately available to all consumers.
- **Atomic commits** - Changes affecting multiple workers or shared libraries can be committed together, making the history easier to understand and reducing the risk of inconsistencies.
- **Consistent tooling** - Apply the same build, test, linting, and formatting configurations (e.g., via Turborepo in `turbo.json` and shared configs in `packages/`) across all projects, ensuring consistent tooling and code quality across Workers.
- **Streamlined CI/CD** - A single pipeline (like the ones in `.github/workflows/`) can build, test, and deploy all Workers, simplifying the release process.
- **Easier refactoring** - Refactoring code that spans multiple workers or shared packages is significantly easier within a single repository.

## Prerequisites

- node.js v22 or later
- pnpm v10 or later
- bun 1.2 or later
- [just](https://just.systems) — task runner

## Getting Started

**Install Dependencies:**

```bash
just install
# or: pnpm install
```

**Run Development Servers:**

Starts the React web app (port 5173) and the API worker (port 8787) concurrently:

```bash
just dev
# or: pnpm dev
```

**Apply Database Schema:**

```bash
pnpm -F pnl-api wrangler d1 create personal-pnl  # create D1 database (first time)
pnpm db:push                                       # apply Drizzle schema to D1
```

**Build:**

```bash
just build
# or: pnpm build
```

**Deploy:**

```bash
just deploy
```

## UI Components — shadcn/ui

This project uses [shadcn/ui](https://ui.shadcn.com) with **Tailwind CSS v4** for the React frontend.

### Adding components

Components are not bundled — they live as editable source files in `apps/web/src/components/ui/`. Add new ones with:

```bash
cd apps/web
pnpm dlx shadcn@latest add <component>
# e.g. pnpm dlx shadcn@latest add card input table
```

### Key paths

| Path | Purpose |
|---|---|
| `apps/web/src/components/ui/` | shadcn component source files |
| `apps/web/src/lib/utils.ts` | `cn()` utility (clsx + tailwind-merge) |
| `apps/web/src/index.css` | Tailwind CSS v4 entry + theme CSS variables |
| `apps/web/components.json` | shadcn configuration |

### Style

The project uses the **base-nova** style with neutral base color and CSS variable theming. CSS variables are defined in `src/index.css` using `oklch()` color format (Tailwind CSS v4 convention).

### Usage in components

```tsx
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```

The `@/` alias maps to `apps/web/src/`.

## Monorepo Structure

```
apps/
  web/          # React + Vite SPA → Cloudflare Pages (port 5173 in dev)
  worker/       # Hono + tRPC API → Cloudflare Worker (port 8787 in dev)
packages/
  types/        # @pnl/types — Drizzle schema, Zod validators, shared TS types
  engine/       # @pnl/engine — P&L computation engine (Decimal.js, no raw JS arithmetic)
  hono-helpers/ # Shared Hono middleware and utilities
  tools/        # Dev scripts and CLI (bin/ scripts used in package.json)
  eslint-config/      # Shared ESLint configuration
  typescript-config/  # Shared tsconfig bases (base, workers, lib, etc.)
turbo/
  generators/   # turbo gen templates for new workers and packages
```

### Type Safety Flow

Types flow in one direction with no manual sync required:

```
packages/types/src/schema.ts  (Drizzle schema)
  → Drizzle infers TypeScript types for all tables
  → Zod schemas validate all inputs (via drizzle-zod)
  → tRPC AppRouter exported from apps/worker
  → apps/web imports AppRouter type only (zero runtime Worker code in browser bundle)
```

The `AppRouter` type is the single contract between frontend and backend.

### Monetary Arithmetic — Decimal.js

All monetary computation uses **Decimal.js** via `@pnl/engine`. Raw JS arithmetic (`+`, `-`, `*`, `/`) on monetary values is **never used** — binary floating-point produces silent errors that corrupt financial totals (`0.1 + 0.2 !== 0.3`).

```
DB read (REAL)  →  new Decimal(value)  →  add() / subtract() / etc.  →  toStorable()  →  DB write
                                                                       →  toDisplay()   →  UI
```

| Import from `@pnl/engine` | Purpose |
|---|---|
| `add`, `subtract`, `multiply`, `divide` | Safe decimal arithmetic |
| `safeDivide` | Division that returns `null` when denominator is zero |
| `toStorable` | Convert `Decimal` → `number` (2 dp) for DB writes |
| `toDisplay` | Format as MXN currency string for UI |
| `computePnl` | Full P&L calculation from transactions + categories |

### Configuration Files

- `Justfile` — Convenient aliases for common development tasks
- `pnpm-workspace.yaml` — Defines the pnpm workspace structure (`apps/*`, `packages/*`)
- `turbo.jsonc` — Configures Turborepo pipeline (build, dev, check, deploy)
- `tsconfig.json` — Root TypeScript config with `@pnl/types` path alias and project references
- `.syncpackrc.cjs` — Keeps dependency versions pinned and in sync across packages

## Available Commands

This repository uses a `Justfile` to provide easy access to common commands. You can explore all available commands by running `just --list`.

Here are some key commands:

- `just` - Show a list of available commands.
- `just install` - Install all dependencies.
- `just dev` - Start development server (context-aware: runs `bun runx dev`).
- `just build` - Build all workers (runs `bun turbo build`).
- `just test` - Run tests (runs `bun vitest`).
- `just check` - Check code quality: deps, lint, types, format (runs `bun runx check`).
- `just fix` - Fix code issues: deps, lint, format, workers-types (runs `bun runx fix`).
- `just preview` - Run Workers in preview mode.
- `just deploy` - Deploy workers (runs `bun turbo deploy`).
- `just cs` - Create a new changeset for versioning.
- `just update deps` - Update dependencies across the monorepo with syncpack.
- `just update pnpm` - Update pnpm version.
- `just update turbo` - Update turbo version.
- `just new-worker` (alias: `just gen`) - Generate a new Cloudflare Worker.
- `just new-package` - Generate a new package for sharing code.

For a complete list of available commands, run `just` or see the [Justfile](./Justfile) for more details.

## GitHub Actions

This repository includes GitHub Actions workflows defined in the `.github/workflows` directory:

- **`branches.yml` (Branches Workflow):**
  - Triggered on pushes to any branch _except_ `main`.
  - Installs dependencies with pnpm.
  - Runs checks/tests (`bun runx ci check`)

- **`release.yml` (Release Workflow):**
  - Triggered on pushes to the `main` branch.
  - Contains two jobs:
    - `test-and-deploy`: Installs dependencies, runs checks/tests (`bun turbo check:ci`), and then deploys all workers (`bun turbo deploy`). This step requires the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets to be configured in your repository's GitHub secrets.
    - `create-release-pr`: Uses [Changesets](https://github.com/changesets/changesets) to create a pull request that compiles changelogs and bumps package versions. This PR is primarily for documentation and versioning, as deployment happens directly on merge to `main`.
# personal-pnl
