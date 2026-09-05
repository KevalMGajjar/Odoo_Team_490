-- CreateEnum
CREATE TYPE "OdooSyncStatus" AS ENUM ('not_synced', 'pending', 'synced', 'failed');

-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "odoo_id" INTEGER,
ADD COLUMN     "odoo_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "odoo_id" INTEGER,
ADD COLUMN     "odoo_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "odoo_move_id" INTEGER,
ADD COLUMN     "odoo_sync_error" TEXT,
ADD COLUMN     "odoo_sync_status" "OdooSyncStatus" NOT NULL DEFAULT 'not_synced',
ADD COLUMN     "odoo_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "journals" ADD COLUMN     "odoo_id" INTEGER,
ADD COLUMN     "odoo_synced_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "odoo_id" INTEGER,
ADD COLUMN     "odoo_synced_at" TIMESTAMP(3);

