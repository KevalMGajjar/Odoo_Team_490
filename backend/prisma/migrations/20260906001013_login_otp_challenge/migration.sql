-- `prisma migrate diff` also wanted to DROP every *_trgm_idx here. Those GIN
-- indexes are created by raw SQL in 20260905234344_fuzzy_search_trgm because
-- Prisma's schema language cannot express `gin_trgm_ops`, so the diff sees them
-- as drift on every migration. They are deliberately kept — dropping them turns
-- fuzzy search back into a sequential scan. Only the column additions below are
-- this migration's actual intent.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "login_challenge" TEXT,
ADD COLUMN     "login_otp" TEXT,
ADD COLUMN     "login_otp_expires" TIMESTAMP(3),
ADD COLUMN     "login_otp_tries" INTEGER NOT NULL DEFAULT 0;
