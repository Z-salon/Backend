-- Customer outstanding balances & refund lifecycle

-- Appointment: final agreed amount (never overwrites the catalog/quoted totalAmount)
-- plus a historical snapshot of the refund policy in force when the appointment was created.
ALTER TABLE "Appointment"
  ADD COLUMN "finalAgreedAmount" DECIMAL(12,2),
  ADD COLUMN "refundPolicyType" "RefundPolicyType",
  ADD COLUMN "refundPercentage" INTEGER,
  ADD COLUMN "refundDeadlineHours" INTEGER;

-- AppointmentPayment: amount of this payment already refunded and confirmed.
ALTER TABLE "AppointmentPayment"
  ADD COLUMN "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- RefundRequest: external-refund confirmation fields (APPROVED -> COMPLETED).
ALTER TABLE "RefundRequest"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "completionReference" TEXT,
  ADD COLUMN "completionNote" TEXT;

-- A rejected/approved refund request is recoverable if a request needs to be re-issued.
ALTER TYPE "RefundRequestStatus" ADD VALUE 'COMPLETED';

-- Allow multiple refund requests over an appointment's lifetime.
DROP INDEX "RefundRequest_appointmentId_key";
CREATE INDEX "RefundRequest_paymentId_idx" ON "RefundRequest"("paymentId");

ALTER TABLE "RefundRequest"
  ADD CONSTRAINT "RefundRequest_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
