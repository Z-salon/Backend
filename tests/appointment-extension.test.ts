import { DateTime } from 'luxon';
import { prisma } from '../src/libs/prisma';
import { appointmentService } from '../src/modules/appointment/services/appointment.service';
import { availabilityService } from '../src/modules/services/availability/availability.service';
import {
  getAppointmentBusyWindow,
  getEffectiveAppointmentEnd,
} from '../src/modules/services/availability/appointment-busy-interval';

/**
 * Phase 5 — Appointment extension + early release.
 *
 * Each scenario uses its own staff member and time window so availability
 * assertions are deterministic regardless of test ordering.
 */

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
    if (match && !String(e.message || '').includes(match) && !String(e.code || '').includes(match)) {
      console.error(`  ✗ FAIL ${testCount}: ${description} — unexpected error: ${e.message} (${e.code})`);
      throw new Error(`Test failed: ${description}`);
    }
    console.log(`  ✓ ${testCount}: ${description}`);
    passCount++;
  }
}

const TZ = 'Africa/Addis_Ababa';
const TEST_DATE = '2026-10-15';
const TEST_DATE_LUXON = DateTime.fromISO(TEST_DATE, { zone: TZ });
const LUXON_DOW = TEST_DATE_LUXON.weekday === 7 ? 0 : TEST_DATE_LUXON.weekday;
const TAG = '+extp5tst';

function startAt(hour: number, minute = 0): Date {
  return DateTime.fromISO(TEST_DATE, { zone: TZ })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toJSDate();
}

function dbTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setHours(h, m, 0, 0);
  return d;
}

/** True when the slot list (ISO strings) contains the given local wall-clock time. */
function hasSlot(starts: string[], hour: number, minute = 0): boolean {
  return starts.some((s) => {
    const dt = DateTime.fromISO(s).setZone(TZ);
    return dt.hour === hour && dt.minute === minute;
  });
}

async function cleanup() {
  const businesses = await prisma.business.findMany({
    where: { slug: { contains: TAG } },
    select: { id: true },
  });

  for (const { id: businessId } of businesses) {
    await prisma.appointmentExtension.deleteMany({ where: { appointment: { businessId } } });
    await prisma.refundRequest.deleteMany({ where: { appointment: { businessId } } });
    await prisma.paymentReceipt.deleteMany({ where: { businessId } });
    await prisma.appointmentPayment.deleteMany({ where: { businessId } });
    await prisma.serviceUsage.deleteMany({ where: { businessId } });
    await prisma.appointmentStatusHistory.deleteMany({ where: { appointment: { businessId } } });
    await prisma.appointmentStaff.deleteMany({ where: { appointment: { businessId } } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.staffServiceQualification.deleteMany({ where: { staff: { businessId } } });
    await prisma.staff.deleteMany({ where: { businessId } });
    await prisma.serviceBranchAssignment.deleteMany({ where: { branch: { businessId } } });
    await prisma.serviceCategoryBranchAssignment.deleteMany({ where: { branch: { businessId } } });
    await prisma.service.deleteMany({ where: { businessId } });
    await prisma.serviceCategory.deleteMany({ where: { businessId } });
    await prisma.branchBookingConfig.deleteMany({ where: { branch: { businessId } } });
    await prisma.branchWeeklyHourInterval.deleteMany({ where: { weeklySchedule: { branch: { businessId } } } });
    await prisma.branchWeeklySchedule.deleteMany({ where: { branch: { businessId } } });
    await prisma.userRoleBranch.deleteMany({ where: { branch: { businessId } } });
    await prisma.branch.deleteMany({ where: { businessId } });
    await prisma.userRole.deleteMany({ where: { businessMember: { businessId } } });
    await prisma.businessMember.deleteMany({ where: { businessId } });
    await prisma.role.deleteMany({ where: { businessId } });
    await prisma.customerPhone.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }

  await prisma.user.deleteMany({ where: { phone: { contains: TAG } } });
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911500001${TAG}`, status: 'ACTIVE' } });
  const business = await prisma.business.create({
    data: { name: 'Extension Salon', slug: `ext-test-${Date.now()}${TAG}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });
  const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const membership = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({
    data: { businessMemberId: membership.id, roleId: ownerRole.id, scopeType: 'BUSINESS' },
  });

  const branch = await prisma.branch.create({
    data: { businessId: business.id, name: 'Main', timezone: TZ, isActive: true },
  });
  const otherBranch = await prisma.branch.create({
    data: { businessId: business.id, name: 'Other', timezone: TZ, isActive: true },
  });

  await prisma.branchBookingConfig.create({
    data: {
      branchId: branch.id,
      onlineBookingEnabled: true,
      walkInEnabled: true,
      minimumAdvanceBookingMinutes: 0,
      maximumAdvanceBookingDays: 90,
    },
  });

  const weekly = await prisma.branchWeeklySchedule.create({
    data: { branchId: branch.id, dayOfWeek: LUXON_DOW, isClosed: false },
  });
  await prisma.branchWeeklyHourInterval.create({
    data: { weeklyScheduleId: weekly.id, startTime: dbTime('09:00'), endTime: dbTime('18:00') },
  });

  const category = await prisma.serviceCategory.create({
    data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' },
  });
  await prisma.serviceCategoryBranchAssignment.create({
    data: { categoryId: category.id, branchId: branch.id, isActive: true },
  });

  // Plain service: 60 min, no buffer — keeps slot arithmetic exact.
  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Ext Plain',
      durationMinutes: 60,
      price: 100,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      depositPolicyType: 'NONE',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: service.id, branchId: branch.id, isActive: true, bufferMinutes: 0 },
  });

  // Buffered service: 60 min + 30 min post-service buffer.
  const bufferedService = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Ext Buffered',
      durationMinutes: 60,
      price: 150,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      depositPolicyType: 'NONE',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: bufferedService.id, branchId: branch.id, isActive: true, bufferMinutes: 30 },
  });

  const staffNames = ['Hana', 'Maria', 'Sara', 'Nati', 'Kalkidan', 'Dawit'];
  const staff: Record<string, { id: string; firstName: string; lastName: string }> = {};
  for (const name of staffNames) {
    const created = await prisma.staff.create({
      data: { businessId: business.id, branchId: branch.id, firstName: name, lastName: 'T', status: 'ACTIVE' },
    });
    staff[name.toLowerCase()] = { id: created.id, firstName: name, lastName: 'T' };
  }

  await prisma.staffServiceQualification.createMany({
    data: staffNames.flatMap((name) => [
      { staffId: staff[name.toLowerCase()].id, serviceId: service.id, isActive: true },
      { staffId: staff[name.toLowerCase()].id, serviceId: bufferedService.id, isActive: true },
    ]),
  });

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
          phone: `+251911500002${TAG}`,
          normalizedPhone: `+251911500002`,
          isPrimary: true,
        },
      },
    },
  });

  // Membership without OWNER/ADMIN, scoped to `otherBranch` only.
  const branchManager = await prisma.user.create({ data: { phone: `+251911500003${TAG}`, status: 'ACTIVE' } });
  const managerRole = await prisma.role.create({
    data: { businessId: business.id, name: 'Branch Manager', systemKey: 'BRANCH_MANAGER' },
  });
  const managerMembership = await prisma.businessMember.create({
    data: { businessId: business.id, userId: branchManager.id, status: 'ACTIVE' },
  });
  const managerUserRole = await prisma.userRole.create({
    data: { businessMemberId: managerMembership.id, roleId: managerRole.id, scopeType: 'BRANCH' },
  });
  await prisma.userRoleBranch.create({
    data: { userRoleId: managerUserRole.id, branchId: otherBranch.id },
  });

  // A user with no membership in this business at all.
  const outsider = await prisma.user.create({ data: { phone: `+251911500004${TAG}`, status: 'ACTIVE' } });

  return {
    owner,
    business,
    branch,
    otherBranch,
    service,
    bufferedService,
    staff,
    customer,
    branchManager,
    outsider,
  };
}

type Fixtures = Awaited<ReturnType<typeof setup>>;

/** Creates a CONFIRMED appointment and walks it through CHECKED_IN → IN_PROGRESS. */
async function makeInProgress(
  f: Fixtures,
  staffId: string,
  serviceId: string,
  hour: number,
  minute = 0
) {
  const appointment = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId,
      staffId,
      scheduledStart: startAt(hour, minute),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );

  await appointmentService.transitionStatus(appointment.id, f.business.id, f.owner.id, 'CHECKED_IN');
  await appointmentService.transitionStatus(appointment.id, f.business.id, f.owner.id, 'IN_PROGRESS');

  return appointment;
}

async function availableSlotsFor(f: Fixtures, staffId: string, serviceId = f.service.id): Promise<string[]> {
  const result = await availabilityService.getAvailableSlots({
    businessId: f.business.id,
    branchId: f.branch.id,
    serviceId,
    date: TEST_DATE,
    staffId,
    source: 'PUBLIC',
  });
  return result.availableSlots.map((slot) => slot.startTime);
}

async function runTests() {
  console.log('🧪 Appointment extension & early release tests\n');
  const f = await setup();

  // ── Centralised busy-window helper (pure) ─────────────────────
  console.log('── 1. Effective busy window helper ──');

  const base = { scheduledStart: startAt(10), scheduledEnd: startAt(11) };

  assert(
    getAppointmentBusyWindow(base, 0).reservedEnd.getTime() === startAt(11).getTime(),
    'Scheduled appointment blocks up to scheduledEnd when there is no buffer'
  );

  const extended = { ...base, extensions: [{ extendedUntil: startAt(11, 30) }] };
  const extendedWindow = getAppointmentBusyWindow(extended, 0);
  assert(
    extendedWindow.effectiveEnd.getTime() === startAt(11, 30).getTime(),
    'Extension pushes the effective end past scheduledEnd'
  );
  assert(
    getAppointmentBusyWindow(extended, 15).reservedEnd.getTime() === startAt(11, 45).getTime(),
    'Buffer is applied exactly once to the extended end (not double-counted)'
  );

  const earlyCompleted = { ...base, status: 'COMPLETED', actualEnd: startAt(10, 40) };
  assert(
    getEffectiveAppointmentEnd(earlyCompleted).getTime() === startAt(10, 40).getTime(),
    'Completed appointment uses the actual completion time as its effective end'
  );
  assert(
    getEffectiveAppointmentEnd({ ...base, status: 'COMPLETED', actualEnd: startAt(9, 0) }).getTime() ===
      startAt(11).getTime(),
    'Nonsensical actualEnd (before scheduledStart) falls back to scheduledEnd'
  );

  // ── 1-4, 16: valid extension, effective end, schedule intact, record stored
  console.log('\n── 2. Extending an IN_PROGRESS appointment ──');

  const hanaAppt = await makeInProgress(f, f.staff.hana.id, f.service.id, 10);
  const hanaFresh = await prisma.appointment.findUnique({ where: { id: hanaAppt.id } });
  assert(hanaFresh!.status === 'IN_PROGRESS', 'Precondition: appointment is IN_PROGRESS');
  assert(
    hanaFresh!.scheduledStart.getTime() === startAt(10).getTime() &&
      hanaFresh!.scheduledEnd.getTime() === startAt(11).getTime(),
    'Precondition: appointment scheduled 10:00 → 11:00'
  );

  const extendedOnce = await appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, {
    extensionMinutes: 30,
    reason: 'Colour processing overran',
  });

  assert(
    extendedOnce.effectiveEnd.getTime() === startAt(11, 30).getTime(),
    '1. Extending by 30 min produces an effective end of 11:30'
  );
  assert(
    extendedOnce.extensions.length === 1 && extendedOnce.extensions[0].extensionMinutes === 30,
    '2. Extension record is returned with the appointment'
  );
  assert(
    extendedOnce.scheduledEnd.getTime() === startAt(11).getTime() &&
      extendedOnce.scheduledStart.getTime() === startAt(10).getTime(),
    '3. Original scheduledStart/scheduledEnd are unchanged by the extension'
  );

  const storedExtension = await prisma.appointmentExtension.findFirst({
    where: { appointmentId: hanaAppt.id },
    orderBy: { createdAt: 'desc' },
  });
  assert(
    !!storedExtension &&
      storedExtension.staffId === f.staff.hana.id &&
      storedExtension.previousEndTime.getTime() === startAt(11).getTime() &&
      storedExtension.extendedUntil.getTime() === startAt(11, 30).getTime() &&
      storedExtension.extensionMinutes === 30 &&
      storedExtension.createdById === f.owner.id,
    '4. AppointmentExtension row records staff, previous end, new end, minutes and actor'
  );

  // Stacking + invalid input (repeated/invalid requests handled safely)
  const extendedTwice = await appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, {
    extensionMinutes: 15,
  });
  assert(
    extendedTwice.effectiveEnd.getTime() === startAt(11, 45).getTime() &&
      extendedTwice.extensions.length === 2 &&
      extendedTwice.extensions[0].previousEndTime.getTime() === startAt(11, 30).getTime(),
    '16a. A second extension stacks on the first one (11:30 + 15 min = 11:45)'
  );

  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, { extensionMinutes: 0 }),
    '16b. Zero-minute extension is rejected',
    'VALIDATION_ERROR'
  );
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, { extensionMinutes: -15 }),
    '16c. Negative extension is rejected',
    'VALIDATION_ERROR'
  );
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, { extensionMinutes: 600 }),
    '16d. Extension beyond the 480-minute cap is rejected',
    'VALIDATION_ERROR'
  );
  assert(
    (await prisma.appointmentExtension.count({ where: { appointmentId: hanaAppt.id } })) === 2,
    '16e. Rejected extension requests created no records'
  );

  // ── 5: cannot extend a completed appointment ──────────────────
  console.log('\n── 3. Status rules ──');

  await appointmentService.transitionStatus(hanaAppt.id, f.business.id, f.owner.id, 'COMPLETED');
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, hanaAppt.id, { extensionMinutes: 30 }),
    '5. A COMPLETED appointment cannot be extended',
    'VALIDATION_ERROR'
  );

  // ── 6: cannot extend cancelled / no-show ──────────────────────
  const saraCancelled = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.sara.id,
      scheduledStart: startAt(10),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, saraCancelled.id, false, undefined, 'test');
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, saraCancelled.id, { extensionMinutes: 30 }),
    '6a. A CANCELLED appointment cannot be extended',
    'VALIDATION_ERROR'
  );

  const saraNoShow = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.sara.id,
      scheduledStart: startAt(12),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  await appointmentService.transitionStatus(saraNoShow.id, f.business.id, f.owner.id, 'NO_SHOW');
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, saraNoShow.id, { extensionMinutes: 30 }),
    '6b. A NO_SHOW appointment cannot be extended',
    'VALIDATION_ERROR'
  );

  // ── 7: authorization ──────────────────────────────────────────
  const authTarget = await makeInProgress(f, f.staff.nati.id, f.service.id, 10);
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.outsider.id, authTarget.id, { extensionMinutes: 30 }),
    '7a. A non-member of the business cannot extend the appointment',
    'NOT_BUSINESS_MEMBER'
  );
  await assertThrows(
    () =>
      appointmentService.extendAppointment(f.business.id, f.branchManager.id, authTarget.id, {
        extensionMinutes: 30,
      }),
    '7b. A user scoped to another branch cannot extend the appointment',
    'FORBIDDEN'
  );
  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, '00000000-0000-0000-0000-000000000000', {
      extensionMinutes: 30,
    }),
    '7c. Extending an unknown appointment returns not-found',
    'NOT_FOUND'
  );

  // nati's appointment was never extended by the unauthorized attempts.
  assert(
    (await prisma.appointmentExtension.count({ where: { appointmentId: authTarget.id } })) === 0,
    '7d. Unauthorized/rejected attempts created no extension records'
  );

  // ── 8, 9, 10: availability, slot validation, blocked creation ──
  console.log('\n── 4. Availability integration ──');

  const mariaAppt = await makeInProgress(f, f.staff.maria.id, f.service.id, 13);

  const slotsBefore = await availableSlotsFor(f, f.staff.maria.id);
  assert(
    hasSlot(slotsBefore, 14, 0) && hasSlot(slotsBefore, 14, 30),
    '8a. Before the extension, 14:00 and 14:30 are both bookable'
  );

  await appointmentService.extendAppointment(f.business.id, f.owner.id, mariaAppt.id, { extensionMinutes: 30 });

  const slotsAfter = await availableSlotsFor(f, f.staff.maria.id);
  assert(
    !hasSlot(slotsAfter, 14, 0) && hasSlot(slotsAfter, 14, 30),
    '8b. After the extension, 14:00 is no longer available in public availability'
  );

  const validationInsideExtended = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branch.id,
    serviceId: f.service.id,
    staffId: f.staff.maria.id,
    startTime: startAt(14, 0).toISOString(),
    source: 'PUBLIC',
  });
  const validationAfter = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branch.id,
    serviceId: f.service.id,
    staffId: f.staff.maria.id,
    startTime: startAt(14, 30).toISOString(),
    source: 'PUBLIC',
  });
  assert(
    validationInsideExtended.valid === false,
    '9a. Slot validation rejects a slot inside the extended window'
  );
  assert(
    validationAfter.valid === true,
    '9b. Slot validation accepts a slot after the extended window'
  );

  const mariaAppointmentsBefore = await prisma.appointment.count({
    where: { businessId: f.business.id, staff: { some: { staffId: f.staff.maria.id } } },
  });
  await assertThrows(
    () =>
      appointmentService.createAppointment(
        {
          businessId: f.business.id,
          branchId: f.branch.id,
          customerId: f.customer.id,
          serviceId: f.service.id,
          staffId: f.staff.maria.id,
          scheduledStart: startAt(14, 0),
          bookingSource: 'STAFF',
        },
        f.owner.id
      ),
    '10a. An appointment overlapping the extended window is rejected',
    'slot'
  );
  assert(
    (await prisma.appointment.count({
      where: { businessId: f.business.id, staff: { some: { staffId: f.staff.maria.id } } },
    })) === mariaAppointmentsBefore,
    '10a-ii. The rejected overlapping booking created no appointment'
  );

  const afterExtension = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.maria.id,
      scheduledStart: startAt(14, 30),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  assert(
    afterExtension.id !== mariaAppt.id,
    '10b. An appointment starting exactly at the extended end is allowed'
  );

  // ── 11: extension conflicting with a following appointment ────
  console.log('\n── 5. Extension conflict & buffer semantics ──');

  const natiAppt = await makeInProgress(f, f.staff.nati.id, f.service.id, 15);

  const followingAppt = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.nati.id,
      scheduledStart: startAt(16),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );

  await assertThrows(
    () => appointmentService.extendAppointment(f.business.id, f.owner.id, natiAppt.id, { extensionMinutes: 30 }),
    '11a. Extension that would overlap the next appointment is rejected',
    'APPOINTMENT_CONFLICT'
  );

  const followingFresh = await prisma.appointment.findUnique({ where: { id: followingAppt.id } });
  assert(
    followingFresh!.scheduledStart.getTime() === startAt(16).getTime() &&
      followingFresh!.scheduledEnd.getTime() === startAt(17).getTime() &&
      followingFresh!.status === 'CONFIRMED',
    '15a. The conflicting following appointment is NOT moved or cancelled'
  );
  assert(
    (await prisma.appointmentExtension.count({ where: { appointmentId: natiAppt.id } })) === 0,
    '15b. The rejected extension was not persisted'
  );

  const dawitAppt = await makeInProgress(f, f.staff.dawit.id, f.bufferedService.id, 15);
  await appointmentService.extendAppointment(f.business.id, f.owner.id, dawitAppt.id, { extensionMinutes: 30 });
  const dawitExtended = await prisma.appointment.findUnique({
    where: { id: dawitAppt.id },
    include: { extensions: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  assert(
    dawitExtended!.scheduledEnd.getTime() === startAt(16).getTime() &&
      dawitExtended!.extensions[0].extendedUntil.getTime() === startAt(16, 30).getTime(),
    '11b. Buffered appointment (60 min) extended by 30 min ends at 16:30'
  );

  await assertThrows(
    () =>
      appointmentService.createAppointment(
        {
          businessId: f.business.id,
          branchId: f.branch.id,
          customerId: f.customer.id,
          serviceId: f.service.id,
          staffId: f.staff.dawit.id,
          scheduledStart: startAt(16, 45),
          bookingSource: 'STAFF',
        },
        f.owner.id
      ),
    '11c. The 30-minute buffer still blocks a slot inside it (16:45)',
    'slot'
  );

  const afterBufferAppt = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.dawit.id,
      scheduledStart: startAt(17),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  assert(
    afterBufferAppt.id !== dawitAppt.id,
    '11d. 17:00 is bookable — the buffer was applied once, not doubled'
  );

  // ── 12, 13, 14: early release ─────────────────────────────────
  console.log('\n── 6. Early release ──');

  const earlyAppt = await makeInProgress(f, f.staff.kalkidan.id, f.service.id, 10);

  // A later appointment for the same staff member, created before the early release.
  const laterAppt = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.kalkidan.id,
      scheduledStart: startAt(12),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );

  const preReleaseSlots = await availableSlotsFor(f, f.staff.kalkidan.id);
  assert(
    !hasSlot(preReleaseSlots, 10, 45),
    '14a. Precondition: 10:45 is not bookable while the appointment runs to 11:00'
  );

  const completed = await appointmentService.transitionStatus(
    earlyAppt.id,
    f.business.id,
    f.owner.id,
    'COMPLETED',
    'Service finished early',
    startAt(10, 40)
  );

  assert(
    completed.actualEnd && completed.actualEnd.getTime() === startAt(10, 40).getTime(),
    '12a. Early completion records the actual completion (release) time'
  );
  assert(
    completed.completedAt !== null && completed.completedAt !== undefined,
    '12b. completedAt is still recorded alongside actualEnd'
  );
  assert(
    completed.scheduledStart.getTime() === startAt(10).getTime() &&
      completed.scheduledEnd.getTime() === startAt(11).getTime(),
    '13. Original scheduledStart/scheduledEnd are unchanged after early release'
  );

  const postReleaseSlots = await availableSlotsFor(f, f.staff.kalkidan.id);
  assert(
    hasSlot(postReleaseSlots, 10, 45),
    '14b. Staff becomes available earlier — 10:45 is bookable after the 10:40 release'
  );

  const earlierBooking = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.staff.kalkidan.id,
      scheduledStart: startAt(10, 45),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  assert(earlierBooking.id !== earlyAppt.id, '14c. The freed 10:45 slot can actually be booked');

  const laterFresh = await prisma.appointment.findUnique({ where: { id: laterAppt.id } });
  assert(
    laterFresh!.scheduledStart.getTime() === startAt(12).getTime() &&
      laterFresh!.scheduledEnd.getTime() === startAt(13).getTime() &&
      laterFresh!.status === 'CONFIRMED',
    '15c. Early release does NOT rearrange the following appointment'
  );

  // ── 12/13 guard: explicit completion time before the start is rejected ──
  const guardAppt = await makeInProgress(f, f.staff.maria.id, f.service.id, 16);
  await assertThrows(
    () =>
      appointmentService.transitionStatus(
        guardAppt.id,
        f.business.id,
        f.owner.id,
        'COMPLETED',
        'bogus',
        startAt(9, 0)
      ),
    '12c. A completion time before the appointment start is rejected',
    'VALIDATION_ERROR'
  );
  const guardFresh = await prisma.appointment.findUnique({ where: { id: guardAppt.id } });
  assert(
    guardFresh!.status === 'IN_PROGRESS' && guardFresh!.actualEnd === null,
    '12d. The rejected completion left the appointment untouched'
  );

  await cleanup();
  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error('\n💥 Test suite failed:', e);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup after failure also failed:', cleanupError);
    }
    process.exit(1);
  });
