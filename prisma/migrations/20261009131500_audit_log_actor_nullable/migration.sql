-- Audit logs for system/customer-initiated actions (e.g. a customer cancelling
-- via their self-service link) have no staff User actor. AppointmentStatusHistory
-- already allows a null actorId; align AuditLog with it.
--
-- Idempotent and additive.

ALTER TABLE "AuditLog" ALTER COLUMN "actorId" DROP NOT NULL;
