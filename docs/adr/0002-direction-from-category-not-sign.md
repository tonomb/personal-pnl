# Direction comes from the Category's Group, not from bank type or a sign

Bank-reported DEBIT/CREDIT proved unreliable across statement formats (LAG-46: credit-card charges import as CREDIT, which silently zeroed category totals). We therefore store transactions as positive magnitudes plus the bank `type` kept only as provenance metadata, and the Category's Group (INCOME / FIXED / VARIABLE / IGNORED) decides which side of the P&L a transaction lands on — every transaction in a category counts toward that category's total regardless of `type`.

Considered and rejected: signed amounts (would bake the unreliable bank direction into storage) and a per-transaction direction override (unneeded complexity for the MVP). Refunds are handled by convention: categorize them into the "Refunds" INCOME category — a refund is income, never negative spend.
