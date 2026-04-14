# AI Learnings

Captured after each session following the compound engineering loop.

- [2026-04-07] tRPC context should expose `db: DrizzleD1Database` (not raw `env`), created via `drizzle(env.DB)` — keeps procedures DB-focused
- [2026-04-07] `run-wrangler-dev` bin script is the right place for `--remote`; worker pkg.json `dev` script delegates there, so one change covers all callers
- [2026-04-07] Pass `{ schema }` to `drizzle(env.DB, { schema })` — without it the client is untyped and query inference (`.from(table)`) silently breaks
- [2026-04-07] wrangler.jsonc is JSONC (comments allowed) but still needs commas between object keys — a missing comma after `database_id` caused a silent parse failure
- [2026-04-13] SheetJS `XLSX.write({type:'array'})` returns a plain `number[]` in jsdom (not `Uint8Array`) — test fixtures need `new Uint8Array(raw)` + `.buffer.slice(byteOffset, byteOffset+byteLength)` to produce a clean ArrayBuffer
- [2026-04-13] TDD horizontal slicing (write all tests → write all impl) produces tests that verify imagined shape, not real behavior; vertical slices (one test → one impl → repeat) keep tests honest
- [2026-04-14] Cloudflare D1 hard limit: **100 bound parameters per statement** — chunk inserts by `floor(100 / params_per_row)` rows, not by row count; also chunk `inArray` dedup queries by 90 IDs
