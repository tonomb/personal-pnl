# AI Learnings

Captured after each session following the compound engineering loop.

- [2026-04-07] tRPC context should expose `db: DrizzleD1Database` (not raw `env`), created via `drizzle(env.DB)` — keeps procedures DB-focused
- [2026-04-07] `run-wrangler-dev` bin script is the right place for `--remote`; worker pkg.json `dev` script delegates there, so one change covers all callers
- [2026-04-07] Pass `{ schema }` to `drizzle(env.DB, { schema })` — without it the client is untyped and query inference (`.from(table)`) silently breaks
- [2026-04-07] wrangler.jsonc is JSONC (comments allowed) but still needs commas between object keys — a missing comma after `database_id` caused a silent parse failure
