# Urban Furniture — Accounting System

A double-entry accounting and inventory system for a furniture business, with a
web client, an offline-capable mobile companion, and a one-directional mirror
into a live Odoo 19 instance.

Built for the Odoo hackathon by Team 490.

---

## What it does

The ledger is the product. Every screen in the application is a way of writing
to or reading from `journal_items`, and the invariants below hold regardless of
which screen produced the entry:

- `journal_items` is the single source of truth. Every report derives from it.
- Every journal entry satisfies `SUM(debit) = SUM(credit)`, enforced in
  `postEntry()` rather than trusted from the caller.
- Debits and credits are always in base currency; `amount_currency` carries the
  foreign amount.
- Posted entries are immutable. Corrections are reversals, not edits.
- Inventory is perpetual and moving-average. The valuation ties to the
  Inventory control account.

Those are checked, not asserted: `npm run verify` re-derives the trial balance,
the voucher projections and the document chain from the database and fails
loudly if any of them drift.

### Functional scope

**Masters** — contacts, products, product categories, chart of accounts,
journals, taxes, currencies with dated exchange rates, analytic accounts.

**Purchase chain** — purchase order to vendor bill to payment, with partial
billing, partial settlement, and stock received at moving-average cost.

**Sales chain** — sales order to customer invoice to receipt, with a separate
cost-of-goods-sold entry raised when tracked goods are delivered.

**Vouchers** — bank and cash receipts and payments, and unrestricted journal
vouchers, each numbered per type per financial year.

**Inventory** — stock moves, valuation layers, and stock adjustments.

**Budgets** — a draft/confirm/revise/cancel workflow over budget lines keyed to
analytic accounts, with achieved amounts computed from posted entries and a
non-blocking over-budget warning when confirming a document that would exceed
its line.

**Reports** — balance sheet, profit and loss, trial balance, general ledger,
budget report, inventory valuation, and a flat transactions view. All exportable
as CSV.

**Portal** — a restricted view for a contact-linked user showing only their own
documents.

---

## Architecture

```
frontend/          Next.js 15 App Router, React 18, Tailwind        :3000
backend/           Express, Prisma, PostgreSQL                      :4000
mobile/            Flutter, Hive offline cache
erp-microservice/  docker-compose for Odoo 19 + Postgres            :8069
```

The backend owns the ledger. The frontend and the mobile app are both clients of
the same REST API; the mobile app additionally keeps a local Hive cache so it
works with no network. Odoo is a downstream mirror and is never authoritative.

### Data model

33 Prisma models. The ones that carry the accounting are `JournalEntry` and
`JournalItem`; everything else either produces entries (documents, vouchers,
stock adjustments) or describes them (masters, sequences, audit).

`prisma/schema.prisma` is canonical. `PLAN.md` is narrative and where the two
disagree, the schema wins.

---

## Running it

Requires Node 20+, PostgreSQL 16+, and Docker if you want the Odoo integration.

### Backend

```
cd backend
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npm install
npm run migrate:deploy
npm run seed
npm run dev
```

`npm run seed` builds a complete demo company: 20 accounts, 15 products, 8
contacts, opening balances, seven vendor bills, fourteen customer invoices
including one settled in USD at a realised gain, payments, vouchers, and three
budgets. It finishes by re-checking that the trial balance balances and that
stock value ties to the Inventory account.

Three accounts are created, all with the password `demo123`:

| Login ID      | Role       | Can do                                        |
| ------------- | ---------- | --------------------------------------------- |
| `admin01`     | Admin      | everything, including user management         |
| `accountant1` | Accountant | masters, documents, reports — no user admin   |
| `nimesh01`    | User       | portal only: their own documents, and pay them |

### Frontend

```
cd frontend
npm install
npm run dev
```

### Odoo (optional)

The application is fully functional without it.

```
cd erp-microservice
docker compose up -d
python scripts/create_db.py       # creates the urban_erp database
python scripts/check_modules.py   # installs account, contacts, product
cd ../backend && npm run sync
```

### Mobile

```
cd mobile
flutter pub get
flutter run                                               # emulator uses 10.0.2.2
flutter build apk --release --dart-define=API_URL=http://<your-lan-ip>:4000
```

On a physical device the backend has to be reachable over the LAN. The login
screen shows which server URL the build is using; tapping it opens settings, and
"Use default" clears a saved one.

---

## Commands

All from `backend/`.

| Command                  | What it does                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run seed`           | Wipe and rebuild the demo company                                   |
| `npm run verify`         | Re-derive the ledger, vouchers and documents from the database      |
| `npm run verify:api`     | 50 end-to-end checks against a running API                          |
| `npm run demo`           | Live proof of the caching layer and the Odoo integration            |
| `npm run sync`           | Push masters and journal entries to Odoo (`-- --force` to re-push)  |
| `npm run files`          | Inventory the image store, joined to the records that reference it  |
| `npm run sample:invoice` | Generate a test invoice PDF for the scanner (see `--preset=`)       |
| `npm run snapshot`       | Dump the database; `npm run restore` puts it back                   |
| `npm run studio`         | Prisma Studio                                                       |

---

## Notable implementation details

Each of these exists because the obvious version of it was wrong.

### Passwords never leave the browser in plaintext

The client derives `PBKDF2-SHA256(password, salt = loginId)` over 100,000
iterations and sends the 64-character hex digest. The server bcrypts that before
storing it. The consequence worth stating: password strength rules can no longer
be enforced server-side, because the server never sees the password. They are
enforced client-side before derivation, and the API rejects anything that is not
the derived shape outright.

This is not a substitute for TLS. It means a compromised server log or a
mistaken request dump never contains a usable password.

### Sign-in has a second factor

A correct password produces a challenge, not a session: a six-digit code mailed
to the account address, plus an opaque 256-bit identifier. Only the pair mints a
token. Verifying against the identifier rather than the login ID is what stops
someone who merely knows a login ID from guessing six digits.

The code is bcrypt-hashed at rest, single-use, expires in ten minutes, and dies
after five wrong attempts. The three seeded demo accounts bypass it, because
their mailboxes are not ones a person trying the application can open.

With no SMTP configured, codes are written to an `outbox` table and returned in
the response in development — this has to work with no internet, and a second
factor nobody can receive is just a lockout.

### Report caching, and what makes it safe

Reports aggregate the whole ledger, so repeating that work for an answer that
cannot have changed is waste. The cache is keyed `namespace:role:url`. The role
is a security boundary, not an optimisation: caching before authentication ran
made every role share one key, and an accountant's report could have been served
to a portal user.

Any successful write drops the entire report namespace. That is blunt on
purpose — a per-key scheme is where staleness bugs hide, and reports are cheap
to recompute. Invalidation is hooked to the response `finish` event rather than
called inside the service, because invalidating mid-transaction leaves a window
where a concurrent read repopulates the cache with pre-commit data.

The cache is in-process, so replicas each keep their own copy and converge
within the 30-second TTL. A shared store is a deployment change, not a rewrite.

### Typo-tolerant search

Contacts, products, accounts and analytic accounts are searched with PostgreSQL
trigram similarity, so "priyesh" finds "Priyanshu". `word_similarity` rather
than `similarity`, because the latter compares whole strings and penalises a
query for the words it did not include — "kishn" against "Kishan Auto Parts"
scores 0.20 whole-string and 0.67 word-wise.

The query uses the `<%` operator and a UNION of per-column branches, not
`word_similarity(...) >= 0.2` with the columns OR'd. Both return identical rows;
only the first uses the GIN indexes. Measured at 50,000 rows: 462ms against
12ms.

### Images are content-addressed files, not database columns

Uploads are stored under `backend/storage/` named by the SHA-256 of their own
bytes, sharded two levels deep. Re-uploading the same image writes it once, a
path can never come to mean different bytes, and the URL is served immutable
with a one-year cache because the content at a path cannot change by definition.

Serving is deliberately not behind authentication: an `<img>` cannot send an
Authorization header and the mobile client uses bearer tokens. The access
control is the unguessable content hash, which is appropriate for product photos
and would not be for scanned documents.

### Invoice scanning runs entirely in the browser

No cloud OCR, no API key, no server round-trip. Digital PDFs go through pdf.js
`getTextContent()`, which is instant and exact; Tesseract runs only as a
fallback for scans and photos. Both are self-hosted under `public/`, so it works
with the network unplugged.

Extraction is heuristic regex over a reconstructed line layout, which will
sometimes be wrong — so nothing writes to the form automatically. Every field
lands in an editable review modal with a confidence score that loses points for
each field it could not find, ticks against matched contacts and products, and
Create buttons for the ones that do not exist yet.

### Odoo receives documents, not just entries

Customer invoices and vendor bills sync as `out_invoice` and `in_invoice`, so
they appear under Customers > Invoices with a partner and a payment state rather
than only in the Journal Entries list. That requires the partner to be pointed
at our receivable and payable control accounts and GST taxes to be created with
repartition lines directing tax into our own accounts — otherwise Odoo derives
the accounting from its defaults and the two ledgers stop agreeing while every
screen still looks right.

Entries raised by a document route to the document; posting an `out_invoice` in
Odoo generates the ledger lines itself, so syncing both would post every invoice
twice. COGS, payments and vouchers stay plain journal entries.

`npm run demo odoo` reconciles the two trial balances account by account, over
raw JSON-RPC rather than through our own API.

### Resilience

`opossum` circuit breakers wrap Odoo RPC and the AI model, so a hung external
service fails fast instead of holding a connection for the full timeout.
Rate limits are strict on authentication and counted per IP and per login ID.
Money-moving endpoints accept an `Idempotency-Key` and replay the original
response, so a lost response never becomes a second payment.

---

## Branches

| Branch                       | Contents                                            |
| ---------------------------- | --------------------------------------------------- |
| `main`                       | The full system. Everything below is merged into it. |
| `ai-voice-assistant-feature` | The read-only voice assistant                        |
| `offline_mobile_app`         | The Flutter companion                                |
| `testing`                    | The Vitest QA suite                                  |

Each branch carries its own README describing that feature in detail.

---

## Repository layout

```
backend/
  prisma/schema.prisma      canonical data model
  src/routes/               HTTP layer, thin
  src/services/             ledger, documents, stock, reports, Odoo sync
  src/lib/                  cache, circuit breaker, fuzzy search, mailer, files
  src/db/                   seed, verification harnesses, demo and tooling
frontend/
  app/(app)/                authenticated application
  components/               UI, documents, OCR, voice, reports
  lib/ocr/                  pdf.js and Tesseract pipeline, invoice parser
mobile/lib/                 Flutter app: screens, providers, services, models
erp-microservice/           Odoo 19 via docker-compose, plus setup scripts
docs/                       supporting notes
```

`PLAN.md`, `IDEAS.md` and `UI.md` are the working design notes kept during the
build. They record why things are the way they are, including the routes not
taken.
