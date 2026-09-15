-- CreateEnum
CREATE TYPE "CustomerConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefundRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "CancellationRecord" DROP CONSTRAINT "CancellationRecord_appointmentId_fkey";

-- DropForeignKey
ALTER TABLE "CancellationRecord" DROP CONSTRAINT "CancellationRecord_approvedById_fkey";

-- AlterTable
ALTER TABLE "BranchBookingConfig" ADD COLUMN     "confirmationDeadlineHours" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "confirmationReminderHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "customerCancellationPolicy" TEXT NOT NULL DEFAULT 'BEFORE_DEADLINE',
ADD COLUMN     "customerConfirmationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refundDeadlineHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "sameDayConfirmationReminderHours" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "confirmationMethod" TEXT,
ADD COLUMN     "confirmationStatus" "CustomerConfirmationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "customerConfirmedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "CancellationRecord";

-- DropEnum
DROP TYPE "RefundStatus";

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "paymentId" TEXT,
    "requestedAmount" DECIMAL(12,2) NOT NULL,
    "approvedAmount" DECIMAL(12,2),
    "status" "RefundRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reason" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefundRequest_appointmentId_key" ON "RefundRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "RefundRequest_appointmentId_idx" ON "RefundRequest"("appointmentId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_idx" ON "RefundRequest"("status");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "AppointmentPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
