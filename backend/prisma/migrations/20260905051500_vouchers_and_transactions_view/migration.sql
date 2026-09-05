-- Voucher identity on journal entries, plus the flat `transactions` view.

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('BReceipt', 'BPayment', 'CReceipt', 'CPayment', 'Journal');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "fiscal_year" INTEGER,
ADD COLUMN     "voucher_no" INTEGER,
ADD COLUMN     "voucher_type" "VoucherType";

-- CreateIndex
CREATE INDEX "journal_entries_voucher_type_fiscal_year_idx" ON "journal_entries"("voucher_type", "fiscal_year");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_voucher_type_fiscal_year_voucher_no_key" ON "journal_entries"("voucher_type", "fiscal_year", "voucher_no");

-- ─────────────────────────────────────────────────────────────────────────────
-- transactions
--
-- Flat, one-row-per-account voucher projection over the double-entry ledger.
-- The ledger (journal_entries + journal_items) stays the source of truth so
-- balance enforcement, immutability and reversal still apply; this view is the
-- read shape.
--
-- SIGN CONVENTION:  amount = credit - debit
--     positive amount = CREDIT   negative amount = DEBIT
--
--   Receipt: party CREDIT (+), bank/cash DEBIT (-)
--   Payment: party DEBIT (-),  bank/cash CREDIT (+)
--
-- Every voucher nets to zero:  SUM(amount) GROUP BY entry_id = 0
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW "transactions" AS
SELECT
    je."date"                       AS "date",
    je."voucher_no"                 AS "voucher_no",
    je."voucher_type"               AS "voucher_type",
    ji."account_id"                 AS "accountid",
    (ji."credit" - ji."debit")      AS "amount",
    je."reference"                  AS "reference",
    je."narration"                  AS "narration",
    -- convenience columns for list screens and drill-down
    ji."id"                         AS "line_id",
    je."id"                         AS "entry_id",
    je."number"                     AS "entry_number",
    je."fiscal_year"                AS "fiscal_year",
    acc."code"                      AS "account_code",
    acc."name"                      AS "account_name",
    acc."type"                      AS "account_type",
    ji."partner_id"                 AS "partner_id",
    ji."label"                      AS "label"
FROM "journal_items" ji
JOIN "journal_entries" je   ON je."id" = ji."entry_id"
JOIN "chart_of_accounts" acc ON acc."id" = ji."account_id"
WHERE je."state" = 'posted'
  AND je."voucher_type" IS NOT NULL;
