-- AlterTable
ALTER TABLE "Business" ADD COLUMN "feedbackEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "FeedbackCategoryType" AS ENUM ('RATING', 'TEXT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "FeedbackRequestStatus" AS ENUM ('PENDING', 'SUBMITTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "FeedbackCategory" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "FeedbackCategoryType" NOT NULL,
    "ratingScaleMin" INTEGER,
    "ratingScaleMax" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "FeedbackRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "feedbackRequestId" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackResponse" (
    "id" TEXT NOT NULL,
    "feedbackSubmissionId" TEXT NOT NULL,
    "feedbackCategoryId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textResponse" TEXT,
    "booleanResponse" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackCategory_businessId_name_key" ON "FeedbackCategory"("businessId", "name");

-- CreateIndex
CREATE INDEX "FeedbackCategory_businessId_idx" ON "FeedbackCategory"("businessId");

-- CreateIndex
CREATE INDEX "FeedbackCategory_businessId_isEnabled_idx" ON "FeedbackCategory"("businessId", "isEnabled");

-- CreateIndex
CREATE INDEX "FeedbackCategory_businessId_sortOrder_idx" ON "FeedbackCategory"("businessId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackRequest_appointmentId_key" ON "FeedbackRequest"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackRequest_tokenHash_key" ON "FeedbackRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "FeedbackRequest_businessId_idx" ON "FeedbackRequest"("businessId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_appointmentId_idx" ON "FeedbackRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_customerId_idx" ON "FeedbackRequest"("customerId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_status_idx" ON "FeedbackRequest"("status");

-- CreateIndex
CREATE INDEX "FeedbackRequest_expiresAt_idx" ON "FeedbackRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackSubmission_feedbackRequestId_key" ON "FeedbackSubmission"("feedbackRequestId");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_feedbackRequestId_idx" ON "FeedbackSubmission"("feedbackRequestId");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_isAnonymous_idx" ON "FeedbackSubmission"("isAnonymous");

-- CreateIndex
CREATE INDEX "FeedbackSubmission_submittedAt_idx" ON "FeedbackSubmission"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackResponse_feedbackSubmissionId_feedbackCategoryId_key" ON "FeedbackResponse"("feedbackSubmissionId", "feedbackCategoryId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_feedbackSubmissionId_idx" ON "FeedbackResponse"("feedbackSubmissionId");

-- CreateIndex
CREATE INDEX "FeedbackResponse_feedbackCategoryId_idx" ON "FeedbackResponse"("feedbackCategoryId");

-- AddForeignKey
ALTER TABLE "FeedbackCategory" ADD CONSTRAINT "FeedbackCategory_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_feedbackRequestId_fkey" FOREIGN KEY ("feedbackRequestId") REFERENCES "FeedbackRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_feedbackSubmissionId_fkey" FOREIGN KEY ("feedbackSubmissionId") REFERENCES "FeedbackSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackResponse" ADD CONSTRAINT "FeedbackResponse_feedbackCategoryId_fkey" FOREIGN KEY ("feedbackCategoryId") REFERENCES "FeedbackCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
