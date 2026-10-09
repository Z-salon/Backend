-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "FeedbackExpiryMode" AS ENUM ('DAYS_7', 'DAYS_15', 'DAYS_30', 'CUSTOM', 'NEVER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterEnum
ALTER TYPE "FeedbackRequestStatus" ADD VALUE IF NOT EXISTS 'REVOKED';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN IF NOT EXISTS "feedbackExpiryMode" "FeedbackExpiryMode" NOT NULL DEFAULT 'DAYS_7',
ADD COLUMN IF NOT EXISTS "feedbackCustomExpiryDays" INTEGER;

-- AlterTable
ALTER TABLE "FeedbackRequest" ALTER COLUMN "expiresAt" DROP NOT NULL,
ADD COLUMN IF NOT EXISTS "encryptedToken" TEXT;

-- AlterTable
ALTER TABLE "FeedbackSubmission" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "requestPayloadHash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackSubmission_idempotencyKey_idx" ON "FeedbackSubmission"("idempotencyKey");
