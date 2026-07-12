# Multi-currency: per-account currency, manual monthly FX rates, hard error when a rate is missing

Accounts carry a currency (transactions inherit it) and every aggregate is converted into a user-chosen Base Currency (single-row `settings` table, default MXN). Rates live in a manually maintained `fx_rates` table keyed by (month, base currency, foreign currency) — pair-keyed so stored rates survive a base-currency switch. Transactions are always stored in their original currency; conversion happens at read time only, so rate corrections recompute history.

A missing rate for a needed (month, currency) pair is a **hard error** (structured, listing the missing pairs) rather than a silent exclusion or nearest-rate fallback: totals must never be silently wrong, and uploading a foreign-currency statement deliberately breaks reports until its rates are entered.

Rejected: FX auto-fetch from an API (external dependency + failure handling out of proportion for a personal tool), per-account fixed rates (drift over history), per-currency report tabs (pushes the mixing problem to every consumer).
