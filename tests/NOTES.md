# Urban Furniture — QA Test Suite Notes

> This file documents the existing test harness mechanics, the DB isolation strategy,
> the QA-doc-to-real-feature mapping, and every resolved/open assumption.

---

## 1. Existing Test Harness Mechanics

### Runner
**No formal test framework.** The backend uses four plain Node.js scripts with custom assertion
helpers (`assert`, `assertEq`, `assertThrows`, `section`). Run via npm scripts:

| Script | Command | Assertions | Destructive? |
|--------|---------|------------|-------------|
| `verify-ledger.js` | `npm run verify:ledger` | ~30 | No (rollback) |
| `verify-voucher.js` | `npm run verify:voucher` | ~32 | No (rollback) |
| `verify-documents.js` | `npm run verify:documents` | ~57 | No (rollback) |
| `verify-api.js` | `npm run verify:api` | ~36 | **Yes** (writes to DB, requires `npm run seed` after) |

### Config Files
- **No** `jest.config.*`, `vitest.config.*`, `.mocharc*`, or `playwright.config.*`
  existed before this branch.
- No test framework packages in `backend/package.json` or `frontend/package.json`.

### Assertion Pattern
All three verify-* suites share the same custom harness:
```js
const ok  = (name) => { pass++; console.log(`  ✓ ${name}`) }
const bad = (name, detail) => { fail++; console.log(`  ✗ ${name}\n      ${detail}`) }
const assert = (cond, name, detail) => cond ? ok(name) : bad(name, detail)
const assertEq = (actual, expected, name) => { /* decimal-aware comparison */ }
const assertThrows = async (fn, status, name) => { /* expects HTTP-style {status} errors */ }
```

### DB Isolation Strategy (Rollback Transaction)
The three non-destructive suites (`verify-ledger`, `verify-voucher`, `verify-documents`) use
a **deliberate-rollback-transaction** pattern:

1. Wrap the entire test in `prisma.$transaction(async (tx) => { ... })`
2. All fixtures are created inside the transaction using the `tx` client
3. All assertions run against `tx` (seeing uncommitted data within the transaction)
4. At the end, `throw new Rollback()` causes the entire transaction to roll back
5. Database is left **exactly as it was found**

For shared control accounts (e.g., account code `1300` Inventory), `verify-documents.js`
uses **delta-based assertions**: snapshot the balance before, run the test, compare only
the change — so it works regardless of existing seed data.

`verify-api.js` is the exception: it makes real HTTP requests against a running server and
**writes to the database**. It requires `npm run seed` to reset afterwards.

---

## 2. New Test Suite — DB Isolation Strategy

### Unit Tests (Vitest, `tests/unit/`)
- **Pure function tests** (e.g., `checkBalance`, `assertBalanced`) need no DB at all
- Where DB access is needed, reuse the rollback-transaction pattern via `withRollback()`
  in `tests/helpers/db.ts`

### Integration Tests (Vitest, `tests/integration/`)
- Hit the live API via HTTP (same as `verify-api.js`)
- Use a **separate test database** (`urban_furniture_test`) to avoid collisions with the
  backend's existing verify suites
- Require the server to be running with `DATABASE_URL` pointing to the test DB
- Seed is run before the suite via `npm run seed` in the test DB context

### E2E Tests (Playwright, `tests/e2e/`)
- Same test database as integration tests
- Playwright drives a real browser against the frontend (port 3000) backed by the API
  (port 4000) connected to the test database

### Why a Separate Database?
The existing `verify-ledger/voucher/documents` suites connect to whatever `DATABASE_URL`
is in `backend/.env`. If the new integration/e2e tests also write to that DB (and they
MUST — they create invoices, payments, etc. via the API), the two harnesses would stomp
on each other's data. A dedicated `urban_furniture_test` database eliminates this.

---

## 3. QA Doc → Real Feature Mapping

The QA doc was written before the app was built. Several of its organizational
assumptions don't match the real architecture. Here is the mapping:

| QA Doc Section | Maps To | Test Directory |
|---------------|---------|----------------|
| Part 1: Master Data | CRUD endpoints for contacts, products, CoA, journals | `tests/unit/master-data/` |
| Part 2: Transaction Modules | PO/Bill/SO/Invoice/Payment endpoints | `tests/integration/sales-chain/`, `purchase-chain/`, `payments/` |
| Part 3: Journal Entry Engine | `assertBalanced()`, `checkBalance()`, `postEntry()` in `ledger.js` | `tests/unit/journal-engine/` |
| Part 4: Validation Matrix | Cross-cutting — assertions spread across relevant test files | (no separate folder) |
| Part 5: RBAC | Auth middleware + role checks across all routes | `tests/integration/rbac/` |
| Part 6: Calculations | `money()`, `D()` helpers + tax/rounding | `tests/unit/journal-engine/calculations.test.ts` |
| Part 7: Multi-Module Integration | Cross-module flows | `tests/integration/multi-module/` |
| Part 8: Accounting Integrity | Sales/Purchase chain traces (AC-SALE/PUR/PAY/TAX/BUDGET) | `tests/integration/sales-chain/`, `purchase-chain/` |
| Part 8-INV: Inventory Alternative | **THIS IS THE REAL BEHAVIOR** — inventory is capitalized | `tests/integration/purchase-chain/purchase-trace.test.ts` |
| Part 9: Reporting | BS, P&L, Budget Report, Trial Balance endpoints | `tests/integration/reporting/` |
| Part 10: Workflows | Full numeric scenarios | `tests/e2e/workflows/` |
| Part 11: E2E System Tests | Full chain tests | `tests/e2e/workflows/end-to-end.spec.ts` |
| Part 12: Edge-Case Matrix | Cross-cutting index | (assertions spread across files) |
| Part 13: Data Integrity | Referential integrity, orphan checks | `tests/integration/data-integrity/` |
| Part 14: Regression | Re-run after every change | `tests/regression/` |
| Part 15: Smoke | Fastest signal build is usable | `tests/e2e/smoke/` |
| Part 16: UAT | Business-owner acceptance | `tests/e2e/uat/` |

---

## 4. Assumption Resolution (A-01 through A-09)

### A-01: Purchases expensed vs. inventorized — ✅ RESOLVED

**Real behavior: Inventory IS capitalized as an asset on purchase.**

Evidence:
- `postVendorBill()` in `bill.js` posts `Dr Inventory (1300) / Dr Input GST (1200) / Cr Creditors (2000)`
- `postCustomerInvoice()` in `invoice.js` creates TWO journal entries:
  - Revenue entry: `Dr Debtors / Cr Sales Income / Cr Output GST`
  - COGS entry: `Dr COGS (5050) / Cr Inventory (1300)` — only for tracked goods
- Seed data confirms: account `1300` is "Inventory" (asset), account `5050` is "COGS" (expense)
- `verify-documents.js` section 2 asserts "Purchase Expense NOT touched for stocked goods"

**Test impact:** Use **PART-8-INV** test set (Inventory capitalized), NOT the original
A-01 set (Purchase Expense). AC-PUR-01 tests for `Dr Inventory`, not `Dr Purchase Expense`.

---

### A-02: Overpayment handling — ✅ RESOLVED

**Real behavior: Overpayment is BLOCKED with 422.**

Evidence:
- `verify-documents.js` lines 294–303: payment exceeding residual throws 422
- `verify-api.js` lines 157–159: HTTP 422 on over-allocation
- No "Customer Advance" account exists in the seeded CoA

**Test impact:** AC-PAY-02 and PAY-006 test for 422 rejection, NOT credit/advance creation.
The `AC-OVERPAY-01..04` defect tests are NOT needed — this is by design.

---

### A-03: Tax model — ✅ RESOLVED

**Real behavior: Single flat percentage per line, exclusive, posted to dedicated liability/asset accounts.**

Evidence:
- `Tax` model in schema with `rate` field (Decimal)
- Seeded presets: GST 0%, 5%, 12%, 18%, 28%
- Account `2100` = "Output GST (Payable)" (liability) — this IS the "Tax Payable" account
- Account `1200` = "Input GST (Receivable)" (asset)
- All invoice/bill posting code calculates `taxAmount = subtotal × gstRate / 100`

**Test impact:** Confirmed as assumed. Tax is exclusive, per-line, posted to dedicated accounts.

---

### A-04: Trial Balance screen — ✅ RESOLVED (assumption was WRONG)

**Real behavior: Trial Balance screen EXISTS.**

Evidence:
- `reports.js` exports `trialBalance(tx, { asOf })`
- Route: `GET /reports/trial-balance` (also supports `?format=csv`)
- `verify-api.js` checks `tb.balanced === true` and tests CSV export

**Test impact:** PROMOTE TB-01..TB-03 from off-system manual reconciliation to
API verification tests. TB-04..TB-06 can be added as the TB screen matures.

---

### A-05: Accountant archive permissions — ⚠️ PARTIALLY RESOLVED

**Real behavior: The CRUD router has role-based middleware, but specific archive
behavior for the Accountant role needs runtime testing.**

Evidence:
- `verify-api.js` confirms `invoicing_user` CANNOT reverse entries (403)
- The CRUD `archive` endpoint likely follows the same pattern
- But we haven't seen an explicit test of Accountant archiving a Contact

**Test impact:** RBAC-02 tests both outcomes (succeed/fail) and documents actual behavior.

---

### A-06: Contact-user auto-creation — ✅ RESOLVED

**Real behavior: Manual. No auto-provisioning on Contact save.**

Evidence:
- `seedMasters.js` creates portal users explicitly with separate `tx.user.create()` calls
- No auto-creation logic found in the Contact CRUD routes
- The portal user (`nimesh@example.com`) is a separate `User` record linked by convention

**Test impact:** CON-USER-01..05 are re-scoped as manual-invite tests, not auto-trigger.

---

### A-07: Analytic Account on transaction lines — ⚠️ STILL OPEN (P0 gap)

**Real behavior: `AnalyticAccount` and `Budget` models exist, but NO transaction line
model (`JournalItem`, `SalesOrderLine`, `PurchaseOrderLine`) has an `analyticAccountId` field.**

Evidence:
- `schema.prisma` has `AnalyticAccount` and `Budget` models
- `JournalItem` fields: `id, entryId, accountId, partnerId, debit, credit, label`
  — NO `analyticAccountId`
- `SalesOrderLine` fields: `id, orderId, productId, quantity, unitPrice, taxRate, subtotal`
  — NO `analyticAccountId`
- The Budget Report endpoint exists (`GET /reports/budget`) but actuals cannot populate

**Test impact:** Budget-related tests (BUD-RPT-01..06, BUD-INT-01..06, AC-BUDGET-01/02)
are all marked `.todo`. This is a schema gap that needs a migration to resolve.

---

### A-08: Currency and precision — ✅ RESOLVED

**Real behavior: Multi-currency with INR base, 2-decimal, round-half-up.**

Evidence:
- `Currency` model with `decimalPlaces` (default 2) and `isBase` flag
- Seeded currencies: INR (base), USD, EUR, AED with exchange rates
- `money.js` uses `Decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP)`
- `verify-documents.js` tests full FX flow (USD invoice, rate change, realised gain)

**Test impact:** Tests should be multi-currency-aware. The FX tests in `verify-documents.js`
(section 6) already cover realised exchange gain. New tests should use INR for simplicity
but the framework supports any currency.

---

### A-09: Zero-value journal entry — ✅ RESOLVED

**Real behavior: Zero-value JE is REJECTED.**

Evidence:
- `assertBalanced()` in `ledger.js`: `if (totalDebit.isZero()) throw err(422, 'total must be > 0')`
- `test_ledger.js` (now deleted) JE-007 confirmed rejection

**Test impact:** JE-007 tests for 422 rejection. JE-008 (both debit AND credit on one line)
is also rejected.

---

## 5. Part 12 — Edge-Case Matrix Cross-Reference

The QA doc's Part 12 is a summary index mapping edge cases across multiple parts.
Rather than maintaining a separate folder, these assertions are distributed across
the relevant test files:

| Edge-Case Area | Covered In |
|---------------|-----------|
| Text field validation (blank, max-length, XSS, SQL injection) | `master-data/*.test.ts` |
| Numeric validation (zero, negative, overflow, precision) | `journal-engine/*.test.ts`, `calculations.test.ts` |
| Date validation (future, past, boundary) | `sales-chain/*.test.ts`, `purchase-chain/*.test.ts` |
| Transaction integrity (concurrent, duplicate, orphan) | `data-integrity/integrity.test.ts` |

---

## 6. Files Modified by This Branch

### Cleanup (committed to `main` before branching)
- `backend/package-lock.json` — peer-dep metadata refresh (no new deps)
- `frontend/package-lock.json` — same
- `frontend/.env.local.example` — restored (accidental working-tree deletion)
- `backend/convert_schema.cjs` → `backend/scripts/convert-schema-to-sqlite.cjs`
- `backend/query` — deleted (scratch)
- `backend/test_ledger.js` — deleted (coverage folded into QA suite)
- `Urban_Furniture_QA_Test_Suite.md` → `docs/`

### New on `testing/qa-suite`
- `package.json` (root) — test scripts
- `vitest.config.ts` — unit/integration test config
- `playwright.config.ts` — e2e test config
- `tests/` — entire directory (see README)
