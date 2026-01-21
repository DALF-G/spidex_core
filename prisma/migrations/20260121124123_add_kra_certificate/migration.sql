/*
  Warnings:

  - You are about to drop the column `description` on the `seller_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `seller_profiles` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "seller_profiles_user_id_idx";

-- AlterTable
ALTER TABLE "seller_profiles" DROP COLUMN "description",
DROP COLUMN "website",
ADD COLUMN     "kra_certificate" TEXT,
ALTER COLUMN "company_name" SET DATA TYPE TEXT,
ALTER COLUMN "kra_pin" SET DATA TYPE TEXT,
ALTER COLUMN "company_location" SET DATA TYPE TEXT,
ALTER COLUMN "phone_primary" SET DATA TYPE TEXT,
ALTER COLUMN "phone_secondary" SET DATA TYPE TEXT;
