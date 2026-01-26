-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_email" TEXT,
ADD COLUMN     "actor_name" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "device" TEXT,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "target" TEXT;

-- AlterTable
ALTER TABLE "seller_profiles" ADD COLUMN     "description" TEXT,
ADD COLUMN     "website" TEXT;

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
