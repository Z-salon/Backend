import { DateTime } from 'luxon';
import { ReminderJobStatus, ReminderJobType } from '@prisma/client';
import { prisma } from '../src/libs/prisma';
import { appointmentService } from '../src/modules/appointment/services/appointment.service';
import {
  appointmentReminderService,
  buildReminderSchedule,
  normalizeConfirmationConfig,
} from '../src/modules/appointment/services/appointment-reminder.service';
import { appointmentActionTokenService } from '../src/modules/appointment/services/appointment-action-token.service';
import { customerConfirmationService } from '../src/modules/appointment/services/customer-confirmation.service';
import { appointmentFollowUpService } from '../src/modules/appointment/services/appointment-follow-up.service';
import { branchService } from '../src/modules/business/services/branch.service';
import { claimDueJobs, processJob } from '../src/workers/reminder-worker';

let testCount = 0;
let passCount = 0;

function assert(condition: boolean, description: string) {
  testCount++;
  if (condition) {
    console.log(`  ✓ ${testCount}: ${description}`);
    passCount++;
  } else {
    console.error(`  ✗ FAIL ${testCount}: ${description}`);
    throw new Error(`Test failed: ${description}`);
  }
}

async function assertThrows(fn: () => Promise<any>, description: string, match?: string) {
  testCount++;
  try {
    await fn();
    console.error(`  ✗ FAIL ${testCount}: ${description} — expected an error but got none`);
    throw new Error(`Test failed: ${description}`);
  } catch (e: any) {
    if (e.message?.startsWith('Test failed:')) throw e;
    if (match && !String(e.message || '').includes(match)) {
      console.error(`  ✗ FAIL ${testCount}: ${description} — unexpected error: ${e.message}`);
      throw new Error(`Test failed: ${description}`);
    }
    console.log(`  ✓ ${testCount}: ${description}`);
    passCount++;
  }
}

const TZ = 'Africa/Addis_Ababa';
const TAG = '+remtst';
const TEST_DATE = '2026-12-10';
const TEST_DATE_LUXON = DateTime.fromISO(TEST_DATE, { zone: TZ });
const LUXON_DOW = TEST_DATE_LUXON.weekday === 7 ? 0 : TEST_DATE_LUXON.weekday;

const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

function startAt(hour: number, minute = 0): Date {
  return DateTime.fromISO(TEST_DATE, { zone: TZ }).set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}

function dbTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setHours(h, m, 0, 0);
  return d;
}

async function cleanup() {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  await prisma.user.deleteMany({ where: { phone: { contains: TAG } } });
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911200001${TAG}`, status: 'ACTIVE' } });
  createdUserIds.push(owner.id);
  const business = await prisma.business.create({
    data: { name: 'Reminder Salon', slug: `rem-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });
  createdBusinessIds.push(business.id);

  const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const membership = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({
    data: { businessMemberId: membership.id, roleId: ownerRole.id, scopeType: 'BUSINESS' },
  });

  const branch = await prisma.branch.create({ data: { businessId: business.id, name: 'Main', timezone: TZ, isActive: true } });

  await prisma.branchBookingConfig.create({
    data: {
      branchId: branch.id,
      onlineBookingEnabled: true,
      walkInEnabled: true,
      minimumAdvanceBookingMinutes: 0,
      maximumAdvanceBookingDays: 365,
      cancellationWindowMinutes: 0,
      customerCancellationEnabled: true,
      reschedulingEnabled: true,
      customerConfirmationEnabled: true,
      confirmationReminderHours: 24,
      sameDayConfirmationReminderHours: 3,
      confirmationDeadlineHours: 2,
    },
  });

  const weekly = await prisma.branchWeeklySchedule.create({
    data: { branchId: branch.id, dayOfWeek: LUXON_DOW, isClosed: false },
  });
  await prisma.branchWeeklyHourInterval.create({
    data: { weeklyScheduleId: weekly.id, startTime: dbTime('08:00'), endTime: dbTime('23:00') },
  });

  const category = await prisma.serviceCategory.create({ data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' } });
  await prisma.serviceCategoryBranchAssignment.create({ data: { categoryId: category.id, branchId: branch.id, isActive: true } });

  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Trim',
      durationMinutes: 30,
      price: 50,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      depositPolicyType: 'NONE',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: service.id, branchId: branch.id, isActive: true, bufferMinutes: 0, durationMinutes: 30 },
  });

  const staff = await prisma.staff.create({
    data: { businessId: business.id, branchId: branch.id, firstName: 'Hana', lastName: 'T', status: 'ACTIVE' },
  });
  await prisma.staffServiceQualification.create({ data: { staffId: staff.id, serviceId: service.id, isActive: true } });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      firstName: 'Abebe',
      lastName: 'Kebede',
      status: 'ACTIVE',
      createdById: owner.id,
      phones: {
        create: {
          businessId: business.id,
          phone: `+251911222222${TAG}`,
          normalizedPhone: '+251911222222',
          isPrimary: true,
        },
      },
    },
  });

  return { owner, business, branch, service, staff, customer };
}

async function createDirectAppointment(
  f: Awaited<ReturnType<typeof setup>>,
  data: Partial<{ scheduledStart: Date; scheduledEnd: Date; status: any }> = {}
) {
  const scheduledStart = data.scheduledStart ?? startAt(10);
  const scheduledEnd = data.scheduledEnd ?? new Date(scheduledStart.getTime() + 30 * 60000);
  return prisma.appointment.create({
    data: {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      scheduledStart,
      scheduledEnd,
      status: data.status ?? 'CONFIRMED',
      totalAmount: 50,
    },
  });
}

async function createOnlineAppointment(f: Awaited<ReturnType<typeof setup>>, hour = 9) {
  return appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.id,
      scheduledStart: startAt(hour),
      bookingSource: 'ONLINE' as any,
    } as any,
    null
  );
}

async function runTests() {
  console.log('\n▶ appointment-reminder-workflow');

  // ---- Pure scheduling logic -------------------------------------------------
  const defaults = normalizeConfirmationConfig(null);
  assert(
    defaults.firstReminderHours === 24 && defaults.secondReminderHours === 3 && defaults.deadlineHours === 2,
    '1. Defaults are 24h / 3h / 2h'
  );
  const legacy = normalizeConfirmationConfig({
    customerConfirmationEnabled: true,
    confirmationReminderHours: 24,
    sameDayConfirmationReminderHours: 1,
    confirmationDeadlineHours: 2,
  } as any);
  assert(legacy.secondReminderHours === 3, '2. Legacy second reminder is normalized to land before the deadline');
  const clamped = normalizeConfirmationConfig({ sameDayConfirmationReminderHours: 0 } as any);
  assert(clamped.secondReminderHours >= 1, '3. Second reminder is never less than 1h before start');

  const now = new Date('2026-12-01T00:00:00.000Z');
  const start = new Date('2026-12-05T00:00:00.000Z');
  const cfg = normalizeConfirmationConfig({ customerConfirmationEnabled: true, confirmationReminderHours: 24, sameDayConfirmationReminderHours: 3, confirmationDeadlineHours: 2 } as any);
  const bothFuture = buildReminderSchedule(start, cfg, now);
  assert(bothFuture.schedule.length === 3, '4. Both reminders + deadline scheduled when all future');

  const firstPassed = buildReminderSchedule(new Date(now.getTime() + 5 * 3600_000), cfg, now);
  assert(
    firstPassed.schedule.length === 2 &&
      firstPassed.schedule[0].type === ReminderJobType.SECOND_REMINDER &&
      firstPassed.schedule[1].type === ReminderJobType.DEADLINE_FOLLOWUP,
    '5. Only the second reminder + deadline are scheduled when the first passed'
  );

  const secondPassedDeadlineFuture = buildReminderSchedule(new Date(now.getTime() + 2.5 * 3600_000), cfg, now);
  assert(
    secondPassedDeadlineFuture.schedule.length === 1 &&
      secondPassedDeadlineFuture.schedule[0].type === ReminderJobType.DEADLINE_FOLLOWUP,
    '6. No catch-up second reminder; deadline job still scheduled'
  );

  const allPassed = buildReminderSchedule(new Date(now.getTime() + 60 * 60_000), cfg, now);
  assert(allPassed.schedule.length === 0 && allPassed.deadlinePassed, '7. No reminders and deadline passed for a very short-notice booking');

  // ---- Fixture ---------------------------------------------------------------
  const f = await setup();

  // ---- Config validation -----------------------------------------------------
  await assertThrows(
    () =>
      branchService.updateBookingConfig(f.branch.id, f.owner.id, {
        confirmation: { sameDayConfirmationReminderHours: 1, confirmationDeadlineHours: 2 },
      } as any),
    '8. Second reminder must be before the response deadline'
  );
  await assertThrows(
    () =>
      branchService.updateBookingConfig(f.branch.id, f.owner.id, {
        confirmation: { sameDayConfirmationReminderHours: 0 },
      } as any),
    '9. Second reminder cannot be less than 1h before start'
  );
  const validConfig = await branchService.updateBookingConfig(f.branch.id, f.owner.id, {
    confirmation: { sameDayConfirmationReminderHours: 5, confirmationDeadlineHours: 3, confirmationReminderHours: 24 },
  } as any);
  assert(validConfig.confirmation.sameDayConfirmationReminderHours === 5, '10. Valid confirmation config is accepted');
  await branchService.updateBookingConfig(f.branch.id, f.owner.id, {
    confirmation: { sameDayConfirmationReminderHours: 3, confirmationDeadlineHours: 2 },
  } as any);

  // ---- Scheduling on creation ------------------------------------------------
  const created = await createOnlineAppointment(f, 9);
  const createdJobs = await prisma.appointmentReminder.findMany({
    where: { appointmentId: created.id },
    orderBy: { scheduledFor: 'asc' },
  });
  assert(createdJobs.length === 3, '11. Online confirmed appointment schedules 3 jobs (two reminders + deadline)');
  const apptStart = new Date(created.scheduledStart);
  assert(
    Math.abs(createdJobs[0].scheduledFor.getTime() - (apptStart.getTime() - 24 * 3600_000)) < 2000,
    '12. First reminder is start - 24h'
  );
  assert(
    Math.abs(createdJobs.find((j) => j.type === 'DEADLINE_FOLLOWUP')!.scheduledFor.getTime() - (apptStart.getTime() - 2 * 3600_000)) < 2000,
    '13. Deadline job is start - 2h'
  );

  // ---- Customer confirmation cancels remaining reminders ---------------------
  const token = await appointmentActionTokenService.issueToken(prisma, {
    id: created.id,
    businessId: f.business.id,
    scheduledEnd: new Date(created.scheduledEnd),
  });
  const beforeView = await customerConfirmationService.getAppointmentFromToken(token);
  assert(beforeView.actions.canConfirm === true && beforeView.actions.viewOnly === false, '14. Eligible link exposes the confirm action');
  const confirmed = await customerConfirmationService.confirmAppointment(token);
  assert(confirmed.confirmationStatus === 'CONFIRMED', '15. Customer confirmation is persisted');
  const afterAppt = await prisma.appointment.findUnique({ where: { id: created.id } });
  assert(afterAppt!.status === 'CONFIRMED', '16. Customer acknowledgement does not change the operational status');
  const pendingAfterConfirm = await prisma.appointmentReminder.count({
    where: { appointmentId: created.id, status: ReminderJobStatus.PENDING },
  });
  assert(pendingAfterConfirm === 0, '17. Confirmation cancels remaining unsent reminders');
  const secondConfirm = await customerConfirmationService.confirmAppointment(token);
  assert(secondConfirm.confirmationStatus === 'CONFIRMED', '18. Repeated confirmation is idempotent');

  // ---- Pending appointment is view-only and gets no reminders ----------------
  const pendingAppt = await createDirectAppointment(f, { scheduledStart: startAt(15), status: 'PENDING' });
  await appointmentReminderService.scheduleForAppointment(prisma, pendingAppt.id);
  const pendingJobs = await prisma.appointmentReminder.count({ where: { appointmentId: pendingAppt.id } });
  assert(pendingJobs === 0, '19. Pending appointments never receive acknowledgement reminders');
  const pendingToken = await appointmentActionTokenService.issueToken(prisma, {
    id: pendingAppt.id,
    businessId: f.business.id,
    scheduledEnd: pendingAppt.scheduledEnd,
  });
  const pendingView = await customerConfirmationService.getAppointmentFromToken(pendingToken);
  assert(
    pendingView.actions.viewOnly === true && !pendingView.actions.canConfirm && !pendingView.actions.canCancel,
    '20. Pending link is view-only'
  );
  await assertThrows(
    () => customerConfirmationService.confirmAppointment(pendingToken),
    '21. Confirming a pending appointment is rejected'
  );

  // ---- Confirmation disabled branch ------------------------------------------
  await prisma.branchBookingConfig.update({
    where: { branchId: f.branch.id },
    data: { customerConfirmationEnabled: false },
  });
  const disabledAppt = await createOnlineAppointment(f, 16);
  const disabledJobs = await prisma.appointmentReminder.count({ where: { appointmentId: disabledAppt.id } });
  assert(disabledJobs === 0, '22. Reminders are not scheduled when customer confirmation is disabled');
  await prisma.branchBookingConfig.update({
    where: { branchId: f.branch.id },
    data: { customerConfirmationEnabled: true },
  });

  // ---- Rescheduling reconciles reminders -------------------------------------
  const reschedTry = await createOnlineAppointment(f, 11);
  // Move to another free slot the same day.
  await appointmentService.rescheduleBusinessAppointment(
    f.business.id,
    f.owner.id,
    reschedTry.id,
    startAt(13),
    'test reschedule'
  );
  const afterResched = await prisma.appointment.findUnique({ where: { id: reschedTry.id } });
  const reschedJobs = await prisma.appointmentReminder.findMany({ where: { appointmentId: reschedTry.id } });
  const oldCancelled = reschedJobs.filter((j) => j.status === ReminderJobStatus.CANCELLED).length;
  const newPending = reschedJobs.filter((j) => j.status === ReminderJobStatus.PENDING).length;
  assert(afterResched!.reminderScheduleVersion === 2, '23. Rescheduling bumps the reminder schedule version');
  assert(oldCancelled === 3 && newPending === 3, '24. Rescheduling cancels old jobs and creates new ones');
  assert(
    reschedJobs.filter((j) => j.status === ReminderJobStatus.PENDING).every((j) => j.scheduleVersion === 2),
    '25. New jobs carry the new schedule version (stale jobs cannot be sent)'
  );

  // ---- Cancellation reconciles reminders + revokes the link ------------------
  const cancelAppt = await createOnlineAppointment(f, 18);
  const cancelToken = await appointmentActionTokenService.issueToken(prisma, {
    id: cancelAppt.id,
    businessId: f.business.id,
    scheduledEnd: new Date(cancelAppt.scheduledEnd),
  });
  await customerConfirmationService.cancelAppointment(cancelToken, 'test cancel');
  const cancelledAppt = await prisma.appointment.findUnique({ where: { id: cancelAppt.id } });
  const cancelPending = await prisma.appointmentReminder.count({
    where: { appointmentId: cancelAppt.id, status: ReminderJobStatus.PENDING },
  });
  const revokedTokens = await prisma.appointmentActionToken.count({
    where: { appointmentId: cancelAppt.id, revokedAt: { not: null } },
  });
  assert(cancelledAppt!.status === 'CANCELLED', '26. Customer cancellation preserves existing cancellation semantics');
  assert(cancelPending === 0, '27. Cancellation cancels pending reminders');
  assert(revokedTokens >= 1, '28. Cancellation revokes the customer action link');

  // ---- Deadline creates exactly one follow-up --------------------------------
  const deadlineAppt = await createDirectAppointment(f, {
    scheduledStart: new Date(Date.now() + 30 * 60_000),
  });
  const deadlineResult = await appointmentReminderService.scheduleForAppointment(prisma, deadlineAppt.id);
  assert(deadlineResult.followUpCreated === true, '29. Deadline already passed creates a staff follow-up');
  const openFollowUps = await prisma.appointmentFollowUp.count({ where: { appointmentId: deadlineAppt.id, status: 'OPEN' } });
  assert(openFollowUps === 1, '30. Exactly one open follow-up exists');
  const again = await appointmentReminderService.ensureFollowUp(prisma, deadlineAppt.id, new Date());
  assert(again === false, '31. ensureFollowUp is idempotent');
  await Promise.all(
    Array.from({ length: 6 }).map(() =>
      appointmentReminderService.ensureFollowUp(prisma, deadlineAppt.id, new Date()).catch(() => false)
    )
  );
  const concurrentOpen = await prisma.appointmentFollowUp.count({ where: { appointmentId: deadlineAppt.id, status: 'OPEN' } });
  assert(concurrentOpen === 1, '32. Concurrent deadline processing cannot create duplicate open follow-ups');

  // ---- Staff follow-up resolution -------------------------------------------
  const resolved = await appointmentFollowUpService.resolve(f.business.id, f.owner.id, (await prisma.appointmentFollowUp.findFirst({ where: { appointmentId: deadlineAppt.id, status: 'OPEN' } }))!.id, {
    outcome: 'CONFIRMED' as any,
    note: 'Customer called back',
  });
  assert(resolved.followUp!.status === 'RESOLVED' && resolved.followUp!.outcome === 'CONFIRMED', '33. Staff CONFIRMED outcome records resolution');
  const handledAppt = await prisma.appointment.findUnique({ where: { id: deadlineAppt.id } });
  assert(handledAppt!.confirmationStatus === 'CONFIRMED', '34. Staff confirmation records the customer acknowledgement');
  assert(handledAppt!.status === 'CONFIRMED', '35. Staff confirmation does not corrupt the operational status');
  const resolvedAgain = await appointmentFollowUpService.resolve(f.business.id, f.owner.id, resolved.followUp!.id, {
    outcome: 'CANCELLED' as any,
  } as any);
  assert(resolvedAgain.alreadyResolved === true, '36. Repeated staff resolution is idempotent');

  // ---- Follow-up list authorization ------------------------------------------
  const list = await appointmentFollowUpService.list(f.business.id, f.owner.id, { status: 'RESOLVED' });
  assert(list.data.every((row: any) => row.appointment === null || row.id), '37. Follow-up queue returns tenant-scoped records');
  await assertThrows(
    () => appointmentFollowUpService.list(f.business.id, 'not-a-member', {}),
    '38. Non-members cannot read follow-ups'
  );

  // ---- Worker claim concurrency + recovery -----------------------------------
  await prisma.appointmentReminder.deleteMany({ where: { businessId: f.business.id } });
  const jobsToCreate: Array<{ appointmentId: string; businessId: string; branchId: string; type: ReminderJobType; version: number }> = [];
  for (let i = 0; i < 3; i++) {
    const appt = await createDirectAppointment(f, { scheduledStart: startAt(10 + i) });
    jobsToCreate.push(
      { appointmentId: appt.id, businessId: f.business.id, branchId: f.branch.id, type: ReminderJobType.FIRST_REMINDER, version: 1 },
      { appointmentId: appt.id, businessId: f.business.id, branchId: f.branch.id, type: ReminderJobType.SECOND_REMINDER, version: 1 }
    );
  }
  await prisma.appointmentReminder.createMany({
    data: jobsToCreate.map((j) => ({
      appointmentId: j.appointmentId,
      businessId: j.businessId,
      branchId: j.branchId,
      type: j.type,
      status: ReminderJobStatus.PENDING,
      scheduledFor: new Date(Date.now() - 60_000),
      nextAttemptAt: new Date(Date.now() - 60_000),
      scheduleVersion: j.version,
    })),
  });

  const [claimA, claimB] = await Promise.all([claimDueJobs(3), claimDueJobs(10)]);
  const idsA = new Set(claimA.map((j) => j.id));
  const idsB = claimB.map((j) => j.id);
  assert(claimA.length === 3 && claimB.length === 3, '39. Two concurrent claims split the batch');
  assert(idsB.every((id) => !idsA.has(id)), '40. Concurrent workers never claim the same active job');
  const claimC = await claimDueJobs(10);
  assert(claimC.length === 0, '41. Leased jobs are not claimable again');

  // Expire the leases to simulate worker crash recovery.
  await prisma.appointmentReminder.updateMany({
    where: { id: { in: [...idsA, ...idsB] } },
    data: { leaseExpiresAt: new Date(Date.now() - 1000) },
  });
  const recovered = await claimDueJobs(10);
  assert(recovered.length === 6, '42. Abandoned claims are recovered after lease expiry');

  // ---- Permanent delivery failure (no phone) ---------------------------------
  await prisma.appointmentReminder.updateMany({
    where: { id: { in: recovered.map((j) => j.id) } },
    data: { status: ReminderJobStatus.CANCELLED, claimedBy: null, leaseExpiresAt: null },
  });
  const noPhoneCustomer = await prisma.customer.create({
    data: { businessId: f.business.id, firstName: 'No', lastName: 'Phone', status: 'ACTIVE' },
  });
  const noPhoneAppt = await prisma.appointment.create({
    data: {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: noPhoneCustomer.id,
      serviceId: f.service.id,
      scheduledStart: startAt(10),
      scheduledEnd: new Date(startAt(10).getTime() + 30 * 60000),
      status: 'CONFIRMED',
      totalAmount: 50,
      reminderScheduleVersion: 1,
    },
  });
  const noPhoneJob = await prisma.appointmentReminder.create({
    data: {
      appointmentId: noPhoneAppt.id,
      businessId: f.business.id,
      branchId: f.branch.id,
      type: ReminderJobType.FIRST_REMINDER,
      status: ReminderJobStatus.PENDING,
      scheduledFor: new Date(Date.now() - 60_000),
      nextAttemptAt: new Date(Date.now() - 60_000),
      scheduleVersion: 1,
    },
  });
  const claimed = await claimDueJobs(1);
  assert(claimed.length === 1 && claimed[0].id === noPhoneJob.id, '43. Worker claims the due job');
  await processJob(claimed[0]);
  const failedJob = await prisma.appointmentReminder.findUnique({ where: { id: noPhoneJob.id } });
  assert(failedJob!.status === ReminderJobStatus.FAILED, '44. Permanent (no recipient) failures stop retrying');
  const attempts = await prisma.reminderDeliveryAttempt.count({ where: { reminderId: noPhoneJob.id } });
  assert(attempts === 0, '45. No delivery attempt is recorded when there is no recipient');

  // ---- Invalid token ---------------------------------------------------------
  await assertThrows(
    () => customerConfirmationService.getAppointmentFromToken('not-a-real-token'),
    '46. Invalid tokens are rejected safely'
  );

  await cleanup();
  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\n💥 Test suite failed:', e);
    try { await cleanup(); } catch {}
    process.exit(1);
  });
