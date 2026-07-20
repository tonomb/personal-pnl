# Store money as integer cents; keep the API in major units

Amounts were stored as SQLite REAL and summed as floats, with decimal.js patching precision after the fact. We now store `amount_cents` (positive integer magnitude) so storage and SQL aggregation are exact, and convert to major-unit numbers (2dp) once at the read boundary. The tRPC/DTO contract stays in major units — the web UI and the MCP advisor (an LLM reader) see pesos, not cents — so cents remain an internal storage/computation detail. decimal.js is confined to `@pnl/money` internals.
