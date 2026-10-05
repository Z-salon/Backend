-- Appointment-level refund policy override.
--
-- The base refundPolicyType / refundPercentage / refundDeadlineHours columns are a
-- historical snapshot captured at appointment creation. These new override columns
-- let a specific appointment explicitly override the branch default:
--
--   override IS NULL      -> inherit the branch's BranchBookingConfig (dynamic)
--   override IS NOT NULL  -> this appointment uses its own refund policy
--
-- NULL therefore means "no override / inherit branch", NOT "explicitly NO_REFUND".
ALTER TABLE "Appointment"
  ADD COLUMN "refundPolicyTypeOverride" "RefundPolicyType",
  ADD COLUMN "refundPercentageOverride" INTEGER,
  ADD COLUMN "refundDeadlineHoursOverride" INTEGER;
