-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('admin', 'accountant', 'user');
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
COMMIT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "login_id" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

