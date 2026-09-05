-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'invoicing_user', 'contact');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('customer', 'vendor', 'both');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('goods', 'service', 'combo');

-- CreateEnum
CREATE TYPE "CostMethod" AS ENUM ('average', 'standard');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('asset', 'liability', 'income', 'expense', 'capital');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('sales', 'purchase', 'bank', 'cash', 'miscellaneous');

-- CreateEnum
CREATE TYPE "EntryState" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('standard', 'revenue', 'bill', 'payment', 'cogs', 'fx', 'stock', 'opening', 'reversal');

-- CreateEnum
CREATE TYPE "DocState" AS ENUM ('draft', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "MoveState" AS ENUM ('draft', 'posted', 'cancelled');

-- CreateEnum
CREATE TYPE "SettleState" AS ENUM ('not_paid', 'partial', 'paid');

-- CreateEnum
CREATE TYPE "PayDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "AnalyticType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "StockMoveType" AS ENUM ('in', 'out', 'adjustment');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "contact_id" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "reset_otp" TEXT,
    "reset_otp_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 2,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currency_rates" (
    "id" TEXT NOT NULL,
    "currency_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "currency_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ContactType" NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "profile_image" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "category_id" TEXT,
    "sales_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_id" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',
    "track_inventory" BOOLEAN NOT NULL DEFAULT false,
    "cost_method" "CostMethod" NOT NULL DEFAULT 'average',
    "on_hand_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avg_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "income_account_id" TEXT,
    "expense_account_id" TEXT,
    "inventory_account_id" TEXT,
    "cogs_account_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "taxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "JournalType" NOT NULL,
    "code" TEXT NOT NULL,
    "default_debit_id" TEXT,
    "default_credit_id" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL DEFAULT 'standard',
    "date" DATE NOT NULL,
    "reference" TEXT,
    "narration" TEXT,
    "state" "EntryState" NOT NULL DEFAULT 'draft',
    "posted_at" TIMESTAMP(3),
    "created_by" TEXT,
    "reversal_of_id" TEXT,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_items" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "partner_id" TEXT,
    "analytic_account_id" TEXT,
    "label" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency_id" TEXT,
    "amount_currency" DECIMAL(14,2),

    CONSTRAINT "journal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytic_accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AnalyticType" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "analytic_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "analytic_account_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "planned_amount" DECIMAL(14,2) NOT NULL,
    "responsible_id" TEXT,
    "status" "Status" NOT NULL DEFAULT 'active',

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "state" "DocState" NOT NULL DEFAULT 'draft',
    "currency_id" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "untaxed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "analytic_account_id" TEXT,
    "qty_billed" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bills" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "purchase_order_id" TEXT,
    "bill_date" DATE NOT NULL,
    "due_date" DATE,
    "state" "MoveState" NOT NULL DEFAULT 'draft',
    "settle_state" "SettleState" NOT NULL DEFAULT 'not_paid',
    "currency_id" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "untaxed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_residual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "journal_entry_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_bill_lines" (
    "id" TEXT NOT NULL,
    "bill_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "analytic_account_id" TEXT,

    CONSTRAINT "vendor_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_date" DATE NOT NULL,
    "state" "DocState" NOT NULL DEFAULT 'draft',
    "currency_id" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "untaxed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "analytic_account_id" TEXT,
    "qty_invoiced" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "sales_order_id" TEXT,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE,
    "state" "MoveState" NOT NULL DEFAULT 'draft',
    "settle_state" "SettleState" NOT NULL DEFAULT 'not_paid',
    "currency_id" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "untaxed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "amount_residual" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "journal_entry_id" TEXT,
    "cogs_entry_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "analytic_account_id" TEXT,
    "cogs_unit_cost" DECIMAL(14,4) NOT NULL DEFAULT 0,

    CONSTRAINT "customer_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "direction" "PayDirection" NOT NULL,
    "partner_id" TEXT NOT NULL,
    "journal_id" TEXT NOT NULL,
    "payment_date" DATE NOT NULL,
    "currency_id" TEXT NOT NULL,
    "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "amount" DECIMAL(14,2) NOT NULL,
    "state" "MoveState" NOT NULL DEFAULT 'draft',
    "journal_entry_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "invoice_id" TEXT,
    "bill_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_moves" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "moveType" "StockMoveType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "date" DATE NOT NULL,
    "reference" TEXT,
    "vendor_bill_id" TEXT,
    "customer_invoice_id" TEXT,
    "adjustment_id" TEXT,
    "journal_entry_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_valuation_layers" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "stock_move_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "value" DECIMAL(14,2) NOT NULL,
    "qty_after" DECIMAL(14,3) NOT NULL,
    "avg_cost_after" DECIMAL(14,4) NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_valuation_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "state" "MoveState" NOT NULL DEFAULT 'draft',
    "journal_entry_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_lines" (
    "id" TEXT NOT NULL,
    "adjustment_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "system_qty" DECIMAL(14,3) NOT NULL,
    "counted_qty" DECIMAL(14,3) NOT NULL,
    "delta" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequences" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "performed_by" TEXT,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_contact_id_key" ON "users"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "currencies_code_key" ON "currencies"("code");

-- CreateIndex
CREATE INDEX "currency_rates_currency_id_date_idx" ON "currency_rates"("currency_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "currency_rates_currency_id_date_key" ON "currency_rates"("currency_id", "date");

-- CreateIndex
CREATE INDEX "contacts_type_status_idx" ON "contacts"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_name_key" ON "product_categories"("name");

-- CreateIndex
CREATE INDEX "products_status_type_idx" ON "products"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_type_code_idx" ON "chart_of_accounts"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "journals_code_key" ON "journals"("code");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_number_key" ON "journal_entries"("number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_state_date_idx" ON "journal_entries"("state", "date");

-- CreateIndex
CREATE INDEX "journal_entries_kind_idx" ON "journal_entries"("kind");

-- CreateIndex
CREATE INDEX "journal_items_account_id_idx" ON "journal_items"("account_id");

-- CreateIndex
CREATE INDEX "journal_items_partner_id_idx" ON "journal_items"("partner_id");

-- CreateIndex
CREATE INDEX "journal_items_analytic_account_id_idx" ON "journal_items"("analytic_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_state_idx" ON "purchase_orders"("state");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_number_key" ON "vendor_bills"("number");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_bills_journal_entry_id_key" ON "vendor_bills"("journal_entry_id");

-- CreateIndex
CREATE INDEX "vendor_bills_state_settle_state_idx" ON "vendor_bills"("state", "settle_state");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_number_key" ON "sales_orders"("number");

-- CreateIndex
CREATE INDEX "sales_orders_state_idx" ON "sales_orders"("state");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_number_key" ON "customer_invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_journal_entry_id_key" ON "customer_invoices"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_invoices_cogs_entry_id_key" ON "customer_invoices"("cogs_entry_id");

-- CreateIndex
CREATE INDEX "customer_invoices_state_settle_state_idx" ON "customer_invoices"("state", "settle_state");

-- CreateIndex
CREATE INDEX "customer_invoices_customer_id_idx" ON "customer_invoices"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_number_key" ON "payments"("number");

-- CreateIndex
CREATE UNIQUE INDEX "payments_journal_entry_id_key" ON "payments"("journal_entry_id");

-- CreateIndex
CREATE INDEX "payments_state_direction_idx" ON "payments"("state", "direction");

-- CreateIndex
CREATE INDEX "stock_moves_product_id_date_idx" ON "stock_moves"("product_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_valuation_layers_stock_move_id_key" ON "stock_valuation_layers"("stock_move_id");

-- CreateIndex
CREATE INDEX "stock_valuation_layers_product_id_date_idx" ON "stock_valuation_layers"("product_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_number_key" ON "stock_adjustments"("number");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_journal_entry_id_key" ON "stock_adjustments"("journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "sequences_code_year_key" ON "sequences"("code", "year");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_performed_at_idx" ON "audit_log"("entity_type", "performed_at");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "currency_rates" ADD CONSTRAINT "currency_rates_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_income_account_id_fkey" FOREIGN KEY ("income_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_expense_account_id_fkey" FOREIGN KEY ("expense_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_inventory_account_id_fkey" FOREIGN KEY ("inventory_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_cogs_account_id_fkey" FOREIGN KEY ("cogs_account_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_default_debit_id_fkey" FOREIGN KEY ("default_debit_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journals" ADD CONSTRAINT "journals_default_credit_id_fkey" FOREIGN KEY ("default_credit_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_items" ADD CONSTRAINT "journal_items_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_responsible_id_fkey" FOREIGN KEY ("responsible_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bills" ADD CONSTRAINT "vendor_bills_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "vendor_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_bill_lines" ADD CONSTRAINT "vendor_bill_lines_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoices" ADD CONSTRAINT "customer_invoices_cogs_entry_id_fkey" FOREIGN KEY ("cogs_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "customer_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_invoice_lines" ADD CONSTRAINT "customer_invoice_lines_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_currency_id_fkey" FOREIGN KEY ("currency_id") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "customer_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_vendor_bill_id_fkey" FOREIGN KEY ("vendor_bill_id") REFERENCES "vendor_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_customer_invoice_id_fkey" FOREIGN KEY ("customer_invoice_id") REFERENCES "customer_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_valuation_layers" ADD CONSTRAINT "stock_valuation_layers_stock_move_id_fkey" FOREIGN KEY ("stock_move_id") REFERENCES "stock_moves"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
