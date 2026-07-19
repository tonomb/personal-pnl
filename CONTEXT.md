# Personal P&L

A personal finance tool that applies company-style P&L analysis to an individual's bank statements: CSV ingestion, manual categorization, monthly P&L with financial health indicators.

## Language

### Transactions

**Transaction**:
A single bank-statement line: date, description, magnitude, bank-reported Type, and the Account it belongs to.

**Amount**:
A money value in major units (pesos/dollars), at most 2 decimal places. This is the only representation the API and UI ever see.
_Avoid_: floats with more than 2dp, "value"

**AmountCents**:
The stored representation of an Amount: a positive integer number of cents. Storage and aggregation happen in cents; conversion to Amount happens once at the read boundary.

**Type (DEBIT / CREDIT)**:
The direction _as reported by the bank statement_. Provenance metadata only — statement formats disagree (credit-card charges often import as CREDIT), so Type is never used to decide which side of the P&L money lands on.
_Avoid_: using Type for Direction, "sign"

**Direction**:
Which side of the P&L a transaction lands on (money in vs money out). Decided by the Group of the transaction's Category, never by Type.

**Uncategorized**:
A Transaction with no Category. Listed in views, excluded from all totals, surfaced through data-quality warnings.

### Categorization

**Category**:
A user-defined label a Transaction is filed under (e.g. "Rent", "Groceries"). Each Category belongs to exactly one Group.

**Group**:
One of INCOME, FIXED, VARIABLE, IGNORED. The Group decides Direction: INCOME adds to income; FIXED/VARIABLE add to expenses; IGNORED is excluded from the P&L.
_Avoid_: "section", "type" (collides with Transaction Type)

**Refund**:
Money returned for a prior expense. By convention categorized into the "Refunds" INCOME Category — refunds are income, never negative spend.

**Tag**:
A cross-cutting label spanning Categories and months (e.g. "New York 2026"). Tag reports follow the same Direction rule as the P&L.

### Money & currency

**Base Currency**:
The user-chosen reporting currency (Settings, default MXN). All aggregates are denominated in it.

**FX Rate**:
A manually maintained monthly conversion rate keyed by (month, Base Currency, foreign currency). Transactions are stored in their Account's currency; conversion happens at read time. A missing FX Rate is a hard error, never a silent fallback.

**Account**:
A bank account or card that statements are imported from. Carries the currency every one of its Transactions inherits.

**Savings Rate**:
Net income divided by total income for a month. A rate (4 decimal places), not money.

**Rollup Cell**:
The unit every money aggregate is computed from: one month × Category × Account bucket of summed transaction magnitudes, already converted to Base Currency cents. Produced in exactly one place; every report is a pure fold over cells.

**Merchant Cell**:
The merchant-grain sibling of the Rollup Cell: one month × merchant (statement description, raw or normalized) bucket of summed magnitudes, already converted to Base Currency cents. Produced next to the Rollup Cell; merchant reports are pure folds over Merchant Cells.
