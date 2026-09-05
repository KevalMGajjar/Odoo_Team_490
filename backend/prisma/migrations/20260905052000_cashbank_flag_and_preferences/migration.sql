-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "is_cash_bank" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key_key" ON "user_preferences"("user_id", "key");

