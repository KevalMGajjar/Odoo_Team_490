# QA Test Suite

An automated test suite for the Urban Furniture accounting system: 259 tests
across 24 files, run with Vitest against a live API and a real database.

---

## What it tests, and why that shape

This is an accounting system, so the tests are organised around the things that
must not be allowed to drift rather than around the code that happens to exist.
A passing test here should mean the ledger is sound, not that a function was
called.

### Unit — `tests/unit/`

**Journal engine** — the double-entry core. Balance enforcement, posting, and
the arithmetic. That an unbalanced entry is refused matters more than any other
single behaviour in the system, so it gets its own file.

**Master data** — contacts, products, chart of accounts, journals, analytic
accounts. Validation, defaults, and the constraints that keep documents
referencing sane records.

### Integration — `tests/integration/`

**Purchase chain** — purchase order to vendor bill, and the trace between them.
Partial billing, stock received at cost, the entries each step produces.

**Sales chain** — sales order to customer invoice, and the separate
cost-of-goods-sold entry raised when tracked goods are delivered.

**Payments** — settlement, partial settlement, allocation, and refusal of a
payment beyond the residual.

**Vouchers** — bank and cash receipts and payments, and journal vouchers, with
their per-type per-year numbering.

**Reporting** — balance sheet, profit and loss, trial balance, budget report,
and a tax trace. These assert the reports agree with the entries beneath them
rather than that they return 200.

**RBAC** — that an accountant cannot manage users, that a portal user cannot
read company-wide reports or list documents that are not theirs. Permission
tests are worth more than most: a permission bug is silent, and looks like the
feature working.

**Data integrity and multi-module** — the invariants that span modules, where a
change in one place breaks an assumption in another.

---

## Running it

```
npm install
npm run test:unit
npm run test:integration
npm run test:all
```

The integration tests need a running API and a seeded database:

```
cd backend
npm run seed
npm run dev
```

Reseed before an integration run. The tests exercise the ledger, so a database
left in the state of a previous run produces failures that describe the previous
run rather than the current code — an entry count that is double what was
expected because the last run's postings are still there.

`NODE_ENV=test` is set by the Vitest config, which is also what disables rate
limiting. Without it the suite trips the authentication limiter partway through
and fails for a reason that has nothing to do with the code under test.

---

## Layout

```
vitest.config.ts        30s test timeout, 60s hooks, path aliases
tests/
  unit/                 journal engine, master data
  integration/          the document chains, payments, vouchers, reporting, RBAC
  e2e/                  Playwright, browser-level
  regression/           cases kept from specific bugs
  fixtures/             shared test data
  helpers/
    setup.ts            global setup
    api.ts              authenticated request helper
  Urban_Furniture_QA_Test_Suite.md   the test plan this implements
  NOTES.md              working notes
```

Aliases: `@helpers`, `@fixtures`, `@backend`.

Timeouts are deliberately generous. These tests do real work against a real
database, and a suite that fails intermittently on timing teaches people to
re-run it rather than read it.

---

## Relationship to the backend's own checks

This suite sits alongside, not instead of, the verification harnesses in
`backend/`:

| Command                       | What it does                                          |
| ----------------------------- | ----------------------------------------------------- |
| `npm run test:unit`           | Vitest, no API needed                                 |
| `npm run test:integration`    | Vitest against a running API                          |
| `cd backend && npm run verify` | Re-derives the ledger, vouchers and documents from SQL |
| `cd backend && npm run verify:api` | 50 end-to-end assertions in one pass              |

The `verify` scripts read the database directly and re-compute what should be
true — the trial balance from journal items, stock value against the Inventory
control account. They answer a different question from the tests: not "does this
code behave as written" but "is the data in the database still coherent". Both
are worth having, and neither substitutes for the other.
