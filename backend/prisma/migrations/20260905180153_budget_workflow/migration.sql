-- CreateEnum
CREATE TYPE "BudgetState" AS ENUM ('draft', 'confirmed', 'revised', 'cancelled');

-- CreateTable (created before the old Budget columns are dropped, so existing
-- single-analytic-account budgets can be copied in as their first line)
CREATE TABLE "budget_lines" (
    "id" TEXT NOT NULL,
    "budget_id" TEXT NOT NULL,
    "analytic_account_id" TEXT NOT NULL,
    "committed_amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- Preserve existing demo budgets: one BudgetLine per budget, carrying over
-- its former single analytic_account_id + planned_amount.
INSERT INTO "budget_lines" ("id", "budget_id", "analytic_account_id", "committed_amount")
SELECT gen_random_uuid(), "id", "analytic_account_id", "planned_amount" FROM "budgets";

-- AlterTable: add the new header columns (state defaults to 'draft' so the
-- NOT NULL add is safe on existing rows, then immediately backfilled below)
ALTER TABLE "budgets"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "revises_id" TEXT,
  ADD COLUMN "state" "BudgetState" NOT NULL DEFAULT 'draft';

-- Former Status.active budgets were already in use for reporting -> Confirmed.
-- Former Status.archived budgets were retired -> Cancelled.
UPDATE "budgets" SET "state" = CASE WHEN "status" = 'active' THEN 'confirmed'::"BudgetState" ELSE 'cancelled'::"BudgetState" END;

-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_analytic_account_id_fkey";

-- AlterTable: drop the old flat single-analytic-account shape
ALTER TABLE "budgets" DROP COLUMN "analytic_account_id",
DROP COLUMN "planned_amount",
DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "budget_lines_analytic_account_id_idx" ON "budget_lines"("analytic_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_revises_id_key" ON "budgets"("revises_id");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_revises_id_fkey" FOREIGN KEY ("revises_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_analytic_account_id_fkey" FOREIGN KEY ("analytic_account_id") REFERENCES "analytic_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
