-- CreateTable
CREATE TABLE "AppointmentExtension" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "previousEndTime" TIMESTAMP(3) NOT NULL,
    "extendedUntil" TIMESTAMP(3) NOT NULL,
    "extensionMinutes" INTEGER NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentExtension_appointmentId_idx" ON "AppointmentExtension"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentExtension_staffId_idx" ON "AppointmentExtension"("staffId");

-- CreateIndex
CREATE INDEX "AppointmentExtension_appointmentId_createdAt_idx" ON "AppointmentExtension"("appointmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AppointmentExtension" ADD CONSTRAINT "AppointmentExtension_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentExtension" ADD CONSTRAINT "AppointmentExtension_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentExtension" ADD CONSTRAINT "AppointmentExtension_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
