## Relevant Files

### Backend
- `apps/worker/vitest.config.ts` - Worker vitest config using `@cloudflare/vitest-pool-workers` *(create)*
- `apps/worker/src/trpc/router.ts` - Add `transactions.getMapping` and `transactions.upload` procedures
- `apps/worker/src/trpc/router.test.ts` - Integration tests for both procedures against local D1 *(create)*
- `packages/types/src/trpc.ts` - Update AppRouter stub to mirror new procedures

### Frontend — Utilities
- `apps/web/src/lib/csv.ts` - Pure utility functions: fingerprint, transaction ID hash, amount parser *(create)*
- `apps/web/src/lib/csv.test.ts` - Unit tests for all three utilities *(create)*
- `apps/web/vitest.config.ts` - Frontend vitest config (jsdom environment) *(create)*

### Frontend — Components
- `apps/web/src/components/upload/DropZone.tsx` - Drag-and-drop / file picker component *(create)*
- `apps/web/src/components/upload/DropZone.test.tsx` - Tests for file filtering and onFiles callback *(create)*
- `apps/web/src/components/upload/ColumnMapper.tsx` - Column mapping UI with live preview table *(create)*
- `apps/web/src/components/upload/ColumnMapper.test.tsx` - Tests for confirm gating and mapping output *(create)*
- `apps/web/src/routes/upload.tsx` - Main upload page; replace stub with full state machine

### Notes
- **Backend tests** use `@cloudflare/vitest-pool-workers` + Miniflare — this gives a real in-memory D1 instance, so no mocking is needed. Use `env.DB` from the `cloudflare:test` helper.
- **Frontend utility tests** use a plain node or jsdom environment — pure functions, no DOM needed.
- **Frontend component tests** use `@testing-library/react` + jsdom.
- Run all tests: `just test` (root). Run one package: `pnpm -F pnl-api exec vitest run`.
- The Worker runs with `--remote` in dev but `--local` / Miniflare in tests — D1 is reset per test file.
- Follow RED → GREEN strictly: write the test, confirm it fails, then write the minimum code to pass.

---

## Phase 1 — Backend

### Setup

- [ ] 1.0 Bootstrap Worker test infrastructure
  - [ ] 1.1 Add `@cloudflare/vitest-pool-workers` as a dev dependency: `pnpm -F worker add -D @cloudflare/vitest-pool-workers`
  - [ ] 1.2 Create `apps/worker/vitest.config.ts` using `defineWorkersProject` pointing at the existing `wrangler.jsonc`; add `miniflare.d1Databases: ['DB']` so tests get an in-memory D1
  - [ ] 1.3 Verify setup: run `pnpm -F pnl-api exec vitest run` — it should find zero tests and exit cleanly

### `transactions.getMapping`

- [ ] 2.0 RED → GREEN: `getMapping` returns null for unknown fingerprint
  - [ ] 2.1 **RED** — Create `apps/worker/src/trpc/router.test.ts`; import the Miniflare `env` helper; call `caller.transactions.getMapping({ fingerprint: 'unknown' })`; assert the result is `null`; run test → it should fail because the procedure doesn't exist
  - [ ] 2.2 **GREEN** — In `router.ts`, add a `transactions` sub-router with a `getMapping` query that queries D1 via Drizzle `eq(columnMappings.fileFingerprint, input.fingerprint)` and returns the first result or `null`; run test → passes

- [ ] 3.0 RED → GREEN: `getMapping` returns saved mapping when fingerprint matches
  - [ ] 3.1 **RED** — In the same test file, seed a `column_mappings` row using `ctx.db.insert(columnMappings).values(...)` in a beforeEach; call `getMapping` with that fingerprint; assert all fields match; run → fails (procedure returns null because seed doesn't exist yet in flow)
  - [ ] 3.2 **GREEN** — No code change needed if 2.2 was correct; just ensure the seed + assertion is right; run → passes

### `transactions.upload`

- [ ] 4.0 RED → GREEN: upload inserts new transactions and returns correct count
  - [ ] 4.1 **RED** — Add test: call `caller.transactions.upload({ transactions: [tx1, tx2], sourceFile: 'bank.csv', mapping: aMapping })`; assert result is `{ inserted: 2, duplicates: 0 }`; run → fails because mutation doesn't exist
  - [ ] 4.2 **GREEN** — Add `transactions.upload` mutation to `router.ts`; upsert the mapping; chunk-insert transactions with `.onConflictDoNothing()`; to count: `SELECT COUNT(*) WHERE id IN (submittedIds)` before insert, diff against total; return `{ inserted, duplicates }`; run → passes

- [ ] 5.0 RED → GREEN: upload skips duplicates on second call
  - [ ] 5.1 **RED** — Add test: call upload twice with the same transactions; on second call assert `{ inserted: 0, duplicates: 2 }`; run → fails (counts are wrong)
  - [ ] 5.2 **GREEN** — Fix the before/after count logic if needed; run → passes

- [ ] 6.0 RED → GREEN: upload upserts the column mapping (updates on conflict)
  - [ ] 6.1 **RED** — Add test: upload with mapping `{ amountCol: 'Amount' }`; then upload again with mapping `{ amountCol: 'Monto' }` (same fingerprint); call `getMapping` and assert `amountCol === 'Monto'`; run → fails (second upload fails or ignores the update)
  - [ ] 6.2 **GREEN** — Ensure the `.onConflictDoUpdate` in the mapping upsert updates all column fields; run → passes

### Finish backend

- [ ] 7.0 Update shared type stub
  - [ ] 7.1 Open `packages/types/src/trpc.ts`; add a `transactions` sub-router with matching procedure shapes (input/output types must match `router.ts` exactly)
  - [ ] 7.2 Run `pnpm -F pnl-web exec tsc --noEmit` — should compile cleanly

---

## Phase 2 — Frontend Utilities

### Setup

- [ ] 8.0 Bootstrap frontend test infrastructure
  - [ ] 8.1 Add vitest + jsdom: `pnpm -F web add -D vitest @testing-library/react @testing-library/user-event jsdom`
  - [ ] 8.2 Create `apps/web/vitest.config.ts` with `environment: 'jsdom'` and `globals: true`
  - [ ] 8.3 Install papaparse: `pnpm -F web add papaparse && pnpm -F web add -D @types/papaparse`
  - [ ] 8.4 Install shadcn components: `cd apps/web && pnpm dlx shadcn@latest add select table badge sonner`

### `csv.ts` utilities

- [ ] 9.0 RED → GREEN: `generateFingerprint` is order-independent
  - [ ] 9.1 **RED** — Create `apps/web/src/lib/csv.test.ts`; import `generateFingerprint`; assert `generateFingerprint(['B','A','C']) === generateFingerprint(['C','A','B'])`; run → fails (file doesn't exist)
  - [ ] 9.2 **GREEN** — Create `apps/web/src/lib/csv.ts`; implement `hashString` + `generateFingerprint` (sort → join → hash); run → passes

- [ ] 10.0 RED → GREEN: `generateFingerprint` produces different values for different headers
  - [ ] 10.1 **RED** — Add test: `generateFingerprint(['Date','Amount']) !== generateFingerprint(['Date','Description'])`; run → may already pass, but verify deliberately
  - [ ] 10.2 **GREEN** — No change needed if hash function is correct; run → passes

- [ ] 11.0 RED → GREEN: `generateTransactionId` is deterministic
  - [ ] 11.1 **RED** — Add test: call `generateTransactionId('2024-01-01','Coffee',4.5)` twice; assert results are equal; run → fails (function not yet exported)
  - [ ] 11.2 **GREEN** — Export `generateTransactionId` in `csv.ts`; run → passes

- [ ] 12.0 RED → GREEN: `parseAmount` handles all four formats
  - [ ] 12.1 **RED** — Add four `it` cases:
    - `parseAmount('$1,234.56')` → `{ amount: 1234.56, type: 'CREDIT' }`
    - `parseAmount('(500.00)')` → `{ amount: 500, type: 'DEBIT' }`
    - `parseAmount('-500.00')` → `{ amount: 500, type: 'DEBIT' }`
    - `parseAmount('1234.56')` → `{ amount: 1234.56, type: 'CREDIT' }`
    Run → all fail (function not exported)
  - [ ] 12.2 **GREEN** — Export `parseAmount` in `csv.ts`; implement stripping `$,` whitespace, treating `(n)` and `-n` as DEBIT, positive as CREDIT; run → all four pass

---

## Phase 3 — Frontend Components

### DropZone

- [ ] 13.0 RED → GREEN: DropZone filters non-CSV files
  - [ ] 13.1 **RED** — Create `apps/web/src/components/upload/DropZone.test.tsx`; render `<DropZone onFiles={spy} />`; simulate a drop event with one `.csv` file and one `.txt` file; assert `spy` was called with only the `.csv` file; run → fails (component doesn't exist)
  - [ ] 13.2 **GREEN** — Create `DropZone.tsx` with drop handler that filters `file.name.endsWith('.csv')`; call `onFiles` with the filtered array; run → passes

- [ ] 14.0 RED → GREEN: DropZone passes multiple CSV files to onFiles
  - [ ] 14.1 **RED** — Add test: drop two `.csv` files; assert `spy` called with array of length 2; run → may already pass, verify
  - [ ] 14.2 **GREEN** — No change needed if 13.2 is correct; run → passes

### ColumnMapper

- [ ] 15.0 RED → GREEN: Confirm button is disabled until required fields are selected
  - [ ] 15.1 **RED** — Create `apps/web/src/components/upload/ColumnMapper.test.tsx`; render `<ColumnMapper headers={['Date','Desc','Amt']} previewRows={[]} fileName="f.csv" onConfirm={spy} onCancel={noop} />`; assert the Confirm button has `disabled` attribute; run → fails (component doesn't exist)
  - [ ] 15.2 **GREEN** — Create `ColumnMapper.tsx`; render disabled Confirm button when `dateCol`, `descriptionCol`, and an amount field are not all set; run → passes

- [ ] 16.0 RED → GREEN: Confirm fires with correct mapping after selections
  - [ ] 16.1 **RED** — Add test: select Date = 'Date', Description = 'Desc', Amount = 'Amt' via user events; click Confirm; assert `spy` called with `{ dateCol: 'Date', descriptionCol: 'Desc', amountCol: 'Amt', useDebitCredit: false }`; run → fails (button still disabled or onConfirm shape wrong)
  - [ ] 16.2 **GREEN** — Wire select state and enable button when all required fields are set; pass `MappingState` to `onConfirm`; run → passes

- [ ] 17.0 RED → GREEN: Preview table updates when mapping changes
  - [ ] 17.1 **RED** — Add test: provide `previewRows=[['2024-01-01','Coffee','4.50']]`; before selecting Date, assert table does not show '2024-01-01'; after selecting Date = 'Date', assert table shows '2024-01-01'; run → fails
  - [ ] 17.2 **GREEN** — Derive visible columns from current mapping state; re-render table on each state change; run → passes

---

## Phase 4 — Upload Page (Integration)

- [ ] 18.0 Wire upload page state machine (no automated test — verify manually)
  - [ ] 18.1 Replace stub in `apps/web/src/routes/upload.tsx` with full component; implement `FileStatus` discriminated union
  - [ ] 18.2 Compose `<DropZone>` → PapaParse → `generateFingerprint` → `trpc.transactions.getMapping` fetch
  - [ ] 18.3 On known fingerprint: auto-build transactions, set `ready`, fire toast
  - [ ] 18.4 On unknown fingerprint: set `mapping`, render `<ColumnMapper>`
  - [ ] 18.5 On `ColumnMapper.onConfirm`: build `NewTransaction[]` (apply `parseAmount` / debit+credit logic, `generateTransactionId` for each id, client-side dedup via `Set`)
  - [ ] 18.6 Render file list with status `<Badge>` per file; show inline `<ColumnMapper>` when in mapping phase
  - [ ] 18.7 Show "Upload All" `<Button>` when ≥1 file is `ready`; on click call `trpc.transactions.upload.mutate` per file
  - [ ] 18.8 On success: set `done`, fire `toast("Inserted X, skipped Y duplicates")`; on error: set `error`, fire `toast.error`

---

## Verification (manual, end-to-end)

1. `just dev` — starts web + worker with remote D1
2. Open `http://localhost:5173/upload`
3. Drop a new CSV → ColumnMapper appears → map columns → preview updates → click Upload
4. Drop same CSV again → toast "Auto-mapped from previous upload" fires, Upload All appears immediately
5. Upload same CSV a third time → result toast shows `inserted: 0, duplicates: N`
6. Confirm in D1: `wrangler d1 execute personal-pnl --command "SELECT COUNT(*) FROM transactions"`
7. Test amount formats: CSV with `$1,234.56`, `(500.00)`, `-500`, `1234.56` values — all parse correctly
