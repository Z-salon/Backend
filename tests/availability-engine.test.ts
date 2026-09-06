import { prisma } from '../src/libs/prisma';
import { availabilityService } from '../src/modules/services/availability/availability.service';
import { generateSlots, alignToSlotStep } from '../src/modules/services/availability/slot-generator';
import { DateTime } from 'luxon';
import {
  getBranchOperatingIntervals,
  getStaffEffectiveIntervals,
  getStaffBreakIntervals,
  getStaffTimeOffIntervals,
} from '../src/modules/services/availability/staff-availability.service';
import { createInterval } from '../src/modules/services/availability/interval.utils';

// ──────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────────────────────────────────────
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

async function assertThrows(fn: () => Promise<any>, description: string) {
  testCount++;
  try {
    await fn();
    console.error(`  ✗ FAIL ${testCount}: ${description} — expected an error but got none`);
    throw new Error(`Test failed: ${description}`);
  } catch (e: any) {
    if (e.message?.startsWith('Test failed:')) throw e;
    console.log(`  ✓ ${testCount}: ${description}`);
    passCount++;
  }
}

// Helper to create a DB-style Time from HH:MM string
function dbTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setHours(h, m, 0, 0);
  return d;
}

// Helper to create a DB Date (midnight UTC)
function dbDate(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00.000Z`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────
const TZ = 'Africa/Addis_Ababa'; // UTC+3
const TEST_DATE = '2026-10-15'; // A Thursday (weekday 4 in Luxon)
const TEST_DATE_LUXON = DateTime.fromISO(TEST_DATE, { zone: TZ });
const LUXON_DOW = TEST_DATE_LUXON.weekday === 7 ? 0 : TEST_DATE_LUXON.weekday; // 4
const TAG = '+avtst';

async function cleanup() {
  // Delete test users and cascade everything
  await prisma.user.deleteMany({ where: { phone: { contains: TAG } } });
}

async function setup() {
  await cleanup();

  // Owner
  const owner = await prisma.user.create({ data: { phone: `+251900000001${TAG}`, status: 'ACTIVE' } });

  // Business
  const business = await prisma.business.create({
    data: { name: 'Test Salon', slug: `av-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });

  // Branch A (same timezone as business)
  const branchA = await prisma.branch.create({
    data: { businessId: business.id, name: 'Branch A', timezone: TZ, isActive: true },
  });

  // Branch B (inactive)
  const branchB = await prisma.branch.create({
    data: { businessId: business.id, name: 'Branch B', timezone: TZ, isActive: false },
  });

  // Booking config for Branch A
  await prisma.branchBookingConfig.create({
    data: {
      branchId: branchA.id,
      onlineBookingEnabled: true,
      minimumAdvanceBookingMinutes: 60,
      maximumAdvanceBookingDays: 60,
    },
  });

  // Category
  const category = await prisma.serviceCategory.create({
    data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' },
  });

  // Assign category to branchA
  await prisma.serviceCategoryBranchAssignment.create({
    data: { categoryId: category.id, branchId: branchA.id, isActive: true },
  });

  // Service A: SALON_ASSIGNS, 45 min duration, 15 min buffer
  const serviceA = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Haircut',
      durationMinutes: 45,
      price: 100,
      employeeAssignmentMode: 'SALON_ASSIGNS',
      status: 'ACTIVE',
    },
  });

  // Assign serviceA to branchA with buffer=15
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: serviceA.id, branchId: branchA.id, isActive: true, bufferMinutes: 15 },
  });

  // Service B: CUSTOMER_CHOOSES, 30 min, no buffer
  const serviceB = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Trim',
      durationMinutes: 30,
      price: 50,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: serviceB.id, branchId: branchA.id, isActive: true, bufferMinutes: 0 },
  });

  // Another business (to test isolation)
  const owner2 = await prisma.user.create({ data: { phone: `+251900000002${TAG}`, status: 'ACTIVE' } });
  const bizOther = await prisma.business.create({
    data: { name: 'Other Salon', slug: `av-other-${Date.now()}`, owner_id: owner2.id, status: 'ACTIVE', timezone: TZ },
  });
  const branchOther = await prisma.branch.create({
    data: { businessId: bizOther.id, name: 'Other Branch', timezone: TZ, isActive: true },
  });

  // Staff members for branchA
  const staffHana = await prisma.staff.create({
    data: { businessId: business.id, branchId: branchA.id, firstName: 'Hana', lastName: 'T', status: 'ACTIVE' },
  });
  const staffSara = await prisma.staff.create({
    data: { businessId: business.id, branchId: branchA.id, firstName: 'Sara', lastName: 'K', status: 'ACTIVE' },
  });
  const staffInactive = await prisma.staff.create({
    data: { businessId: business.id, branchId: branchA.id, firstName: 'Off', lastName: 'X', status: 'INACTIVE' },
  });

  // Qualifications: both Hana and Sara qualified for serviceA
  await prisma.staffServiceQualification.createMany({
    data: [
      { staffId: staffHana.id, serviceId: serviceA.id, isActive: true },
      { staffId: staffSara.id, serviceId: serviceA.id, isActive: true },
      { staffId: staffHana.id, serviceId: serviceB.id, isActive: true }, // Hana also does serviceB
    ],
  });

  // Branch A weekly schedule: Thursday (LUXON_DOW=4) 09:00-18:00
  const branchSchedule = await prisma.branchWeeklySchedule.create({
    data: { branchId: branchA.id, dayOfWeek: LUXON_DOW, isClosed: false },
  });
  await prisma.branchWeeklyHourInterval.create({
    data: { weeklyScheduleId: branchSchedule.id, startTime: dbTime('09:00'), endTime: dbTime('18:00') },
  });

  return { owner, business, branchA, branchB, branchOther, bizOther, category, serviceA, serviceB, staffHana, staffSara, staffInactive };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Test Runner
// ──────────────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('🧪 Availability Engine Test Suite\n');

  const f = await setup();

  // ── 1. SLOT GENERATOR UNIT TESTS ─────────────────────────────
  console.log('── 1. Slot Generator ──');

  const ivStart = DateTime.fromISO(`${TEST_DATE}T09:00:00`, { zone: TZ });
  const ivEnd = DateTime.fromISO(`${TEST_DATE}T18:00:00`, { zone: TZ });
  const iv = createInterval(ivStart, ivEnd);

  const slots45buf15 = generateSlots([iv], 45, 15);
  assert(slots45buf15.length > 0, 'Slots generated for 09:00–18:00 with 45+15 block');
  // First slot should start at 09:00
  assert(slots45buf15[0].startTime.hour === 9 && slots45buf15[0].startTime.minute === 0, 'First slot starts at 09:00');
  // serviceEndTime = start + 45
  assert(slots45buf15[0].serviceEndTime.diff(slots45buf15[0].startTime, 'minutes').minutes === 45, 'serviceEndTime = start + 45');
  // reservedEndTime = start + 60
  assert(slots45buf15[0].reservedEndTime.diff(slots45buf15[0].startTime, 'minutes').minutes === 60, 'reservedEndTime = start + 60');
  // Last slot's reserved end must be <= 18:00
  const last = slots45buf15[slots45buf15.length - 1];
  assert(last.reservedEndTime <= ivEnd, 'Last slot reserved end fits within closing time');
  // Slot that would exceed closing time is excluded
  const close17 = createInterval(ivStart, DateTime.fromISO(`${TEST_DATE}T17:05:00`, { zone: TZ }));
  const slotsNearClose = generateSlots([close17], 45, 15);
  assert(slotsNearClose.every((s) => s.reservedEndTime <= close17.end), 'No slot overruns closing time');

  // Buffer = 0
  const buf0Slots = generateSlots([iv], 30, 0);
  assert(buf0Slots[0].reservedEndTime.equals(buf0Slots[0].serviceEndTime), 'Buffer=0: serviceEndTime equals reservedEndTime');

  // Slot alignment
  const alignedFrom9_03 = alignToSlotStep(DateTime.fromISO(`${TEST_DATE}T09:03:00`, { zone: TZ }));
  assert(alignedFrom9_03.minute === 15, 'alignToSlotStep: 09:03 aligns to 09:15');
  const alignedFrom9_00 = alignToSlotStep(DateTime.fromISO(`${TEST_DATE}T09:00:00`, { zone: TZ }));
  assert(alignedFrom9_00.minute === 0 && alignedFrom9_00.hour === 9, 'alignToSlotStep: 09:00 stays at 09:00');

  // Multiple intervals: break in the middle (09:00-13:00 and 14:00-18:00)
  const iv1 = createInterval(
    DateTime.fromISO(`${TEST_DATE}T09:00:00`, { zone: TZ }),
    DateTime.fromISO(`${TEST_DATE}T13:00:00`, { zone: TZ })
  );
  const iv2 = createInterval(
    DateTime.fromISO(`${TEST_DATE}T14:00:00`, { zone: TZ }),
    DateTime.fromISO(`${TEST_DATE}T18:00:00`, { zone: TZ })
  );
  const splitSlots = generateSlots([iv1, iv2], 45, 15);
  // No slot should span across the gap (13:00-14:00)
  for (const s of splitSlots) {
    assert(
      s.reservedEndTime <= iv1.end || s.startTime >= iv2.start,
      `No slot crosses the 13:00–14:00 gap (${s.startTime.toISO()})`
    );
  }

  // ── 2. BRANCH OPERATING HOURS ─────────────────────────────────
  console.log('\n── 2. Branch Operating Hours ──');

  const branchHours = await getBranchOperatingIntervals(f.branchA.id, TEST_DATE_LUXON, TZ);
  assert(branchHours.length === 1, 'Branch has 1 operating interval for Thursday');
  assert(branchHours[0].start.hour === 9, 'Branch opens at 09:00');
  assert(branchHours[0].end.hour === 18, 'Branch closes at 18:00');

  // Day with no schedule = closed
  const sundayDate = DateTime.fromISO('2026-10-18', { zone: TZ }); // Sunday
  const sundayHours = await getBranchOperatingIntervals(f.branchA.id, sundayDate, TZ);
  assert(sundayHours.length === 0, 'No branch hours on Sunday (no schedule)');

  // Date override — set a custom day
  const overrideDate = DateTime.fromISO('2026-10-22', { zone: TZ }); // Thursday
  const overrideDateDb = dbDate('2026-10-22');
  const override = await prisma.branchDateOverride.create({
    data: { branchId: f.branchA.id, date: overrideDateDb, isClosed: false },
  });
  await prisma.branchDateOverrideInterval.create({
    data: { overrideId: override.id, startTime: dbTime('10:00'), endTime: dbTime('15:00') },
  });
  // The weekly schedule for Thursday (overrideDow) already exists from setup
  // so we don't need to recreate it.
  const overrideHours = await getBranchOperatingIntervals(f.branchA.id, overrideDate, TZ);
  assert(overrideHours.length === 1, 'Override exists: 1 interval');
  assert(overrideHours[0].start.hour === 10, 'Override start is 10:00');
  assert(overrideHours[0].end.hour === 15, 'Override end is 15:00');

  // Date override: closed
  const closedDate = DateTime.fromISO('2026-10-29', { zone: TZ });
  const closedOverride = await prisma.branchDateOverride.create({
    data: { branchId: f.branchA.id, date: dbDate('2026-10-29'), isClosed: true },
  });
  const closedHours = await getBranchOperatingIntervals(f.branchA.id, closedDate, TZ);
  assert(closedHours.length === 0, 'Branch closed via date override returns empty intervals');

  // ── 3. STAFF SCHEDULE ─────────────────────────────────────────
  console.log('\n── 3. Staff Schedule ──');

  // Hana has no schedule → should use branch hours
  const hanaIntervals = await getStaffEffectiveIntervals(f.staffHana.id, f.branchA.id, TEST_DATE_LUXON, TZ);
  assert(hanaIntervals.length === 1, 'Hana has no schedule → uses branch hours (1 interval)');
  assert(hanaIntervals[0].start.hour === 9 && hanaIntervals[0].end.hour === 18, 'Hana interval matches branch 09:00-18:00');

  // Configure Sara with a custom schedule: 10:00-16:00
  const saraScheduleDay = await prisma.staffWeeklyScheduleDay.create({
    data: { staffId: f.staffSara.id, dayOfWeek: LUXON_DOW, isWorking: true },
  });
  await prisma.staffWeeklyHours.create({
    data: { scheduleDayId: saraScheduleDay.id, intervalStart: dbTime('10:00'), intervalEnd: dbTime('16:00') },
  });
  const saraIntervals = await getStaffEffectiveIntervals(f.staffSara.id, f.branchA.id, TEST_DATE_LUXON, TZ);
  assert(saraIntervals.length === 1, 'Sara has schedule: 1 interval');
  assert(saraIntervals[0].start.hour === 10, 'Sara starts at 10:00');
  assert(saraIntervals[0].end.hour === 16, 'Sara ends at 16:00');

  // Staff schedule wider than branch hours → clipped to branch hours
  const staffEarlyDay = await prisma.staffWeeklyScheduleDay.create({
    data: { staffId: f.staffHana.id, dayOfWeek: LUXON_DOW, isWorking: true },
  });
  await prisma.staffWeeklyHours.create({
    data: { scheduleDayId: staffEarlyDay.id, intervalStart: dbTime('07:00'), intervalEnd: dbTime('21:00') },
  });
  const hanaClipped = await getStaffEffectiveIntervals(f.staffHana.id, f.branchA.id, TEST_DATE_LUXON, TZ);
  assert(hanaClipped[0].start.hour === 9, 'Staff schedule clipped to branch open (07:00 → 09:00)');
  assert(hanaClipped[0].end.hour === 18, 'Staff schedule clipped to branch close (21:00 → 18:00)');

  // Staff explicitly OFF
  const offDay = await prisma.staffWeeklyScheduleDay.create({
    data: { staffId: f.staffSara.id, dayOfWeek: (LUXON_DOW + 1) % 7, isWorking: false },
  });
  const friDate = TEST_DATE_LUXON.plus({ days: 1 }); // Friday
  const saraFri = await getStaffEffectiveIntervals(f.staffSara.id, f.branchA.id, friDate, TZ);
  assert(saraFri.length === 0, 'Sara is OFF: no effective intervals');

  // ── 4. STAFF BREAKS ───────────────────────────────────────────
  console.log('\n── 4. Staff Breaks ──');

  // Add recurring break for Hana on Thursday: 13:00-14:00
  await prisma.staffWeeklyBreak.create({
    data: { staffId: f.staffHana.id, dayOfWeek: LUXON_DOW, breakStart: dbTime('13:00'), breakEnd: dbTime('14:00') },
  });
  const hanaWithBreak = await getStaffEffectiveIntervals(f.staffHana.id, f.branchA.id, TEST_DATE_LUXON, TZ);
  assert(hanaWithBreak.length === 2, 'Hana has 2 intervals after lunch break removed');
  assert(hanaWithBreak[0].start.hour === 9 && hanaWithBreak[0].end.hour === 13, 'Before-break interval: 09:00-13:00');
  assert(hanaWithBreak[1].start.hour === 14 && hanaWithBreak[1].end.hour === 18, 'After-break interval: 14:00-18:00');

  // Validate break intervals directly
  const hanaBreaks = await getStaffBreakIntervals(f.staffHana.id, TEST_DATE_LUXON, TZ);
  assert(hanaBreaks.length === 1, 'Hana has 1 recurring break interval');
  assert(hanaBreaks[0].start.hour === 13, 'Hana break starts at 13:00');

  // Break override: replace recurring break with a different one for a specific date
  const breakOverrideDate = DateTime.fromISO('2026-10-22', { zone: TZ });
  const breakOverride = await prisma.staffBreakOverride.create({
    data: { staffId: f.staffHana.id, date: dbDate('2026-10-22') },
  });
  await prisma.staffBreakOverrideInterval.create({
    data: { overrideId: breakOverride.id, breakStart: dbTime('15:00'), breakEnd: dbTime('16:00') },
  });
  const hanaBreaksOnOverrideDate = await getStaffBreakIntervals(f.staffHana.id, breakOverrideDate, TZ);
  assert(hanaBreaksOnOverrideDate.length === 1, 'Break override replaces recurring break');
  assert(hanaBreaksOnOverrideDate[0].start.hour === 15, 'Override break starts at 15:00 (not 13:00)');

  // ── 5. STAFF TIME OFF ─────────────────────────────────────────
  console.log('\n── 5. Staff Time Off ──');

  // All-day time off
  const timeOffDate = DateTime.fromISO('2026-11-04', { zone: TZ }); // Wednesday
  // First add a branch schedule for that day (Wednesday)
  const timeOffDow = timeOffDate.weekday === 7 ? 0 : timeOffDate.weekday;
  // The weekly schedule for Wednesday (timeOffDow) does not exist, so we create it.
  const timeOffSchedule = await prisma.branchWeeklySchedule.create({
    data: { branchId: f.branchA.id, dayOfWeek: timeOffDow, isClosed: false },
  });
  await prisma.branchWeeklyHourInterval.create({
    data: { weeklyScheduleId: timeOffSchedule.id, startTime: dbTime('09:00'), endTime: dbTime('18:00') },
  });
  await prisma.staffTimeOff.create({
    data: { staffId: f.staffHana.id, date: dbDate('2026-11-04'), allDay: true },
  });
  const hanaTimeOff = await getStaffEffectiveIntervals(f.staffHana.id, f.branchA.id, timeOffDate, TZ);
  assert(hanaTimeOff.length === 0, 'All-day time off: no availability');

  // Partial time off: 14:00-16:00
  const partialTimeOffDate = DateTime.fromISO('2026-11-12', { zone: TZ });
  const partialDow = partialTimeOffDate.weekday === 7 ? 0 : partialTimeOffDate.weekday;
  // partialDow is 4 (Thursday), which already has a weekly schedule from setup. No need to create it.
  await prisma.staffTimeOff.create({
    data: {
      staffId: f.staffSara.id,
      date: dbDate('2026-11-12'),
      allDay: false,
      intervalStart: dbTime('14:00'),
      intervalEnd: dbTime('16:00'),
    },
  });
  const saraPartialTimeOff = await getStaffEffectiveIntervals(f.staffSara.id, f.branchA.id, partialTimeOffDate, TZ);
  // Sara has schedule 10:00-16:00 on Thursdays via her weekly schedule (which is day 4, but partialTimeOffDate is Thursday Nov 12)
  // Honestly Sara's weekly schedule has dayOfWeek=4. Nov 12 2026 is a Thursday, so it will kick in.
  // 10:00-16:00 minus 14:00-16:00 = 10:00-14:00
  assert(saraPartialTimeOff.length === 1, 'Sara has 1 interval after partial time off');
  assert(saraPartialTimeOff[0].start.hour === 10 && saraPartialTimeOff[0].end.hour === 14, 'Sara available 10:00-14:00 after partial time off 14:00-16:00');

  // ── 6. SERVICE CONFIGURATION ──────────────────────────────────
  console.log('\n── 6. Service Configuration ──');

  const config = await availabilityService.resolveServiceBranchConfig(f.serviceA.id, f.branchA.id);
  assert(config !== null, 'Service config resolved');
  assert(config!.effectiveDurationMinutes === 45, 'Service duration = 45');
  assert(config!.bufferMinutes === 15, 'Buffer = 15');

  // Branch-level override: custom duration
  await prisma.serviceBranchAssignment.update({
    where: { serviceId_branchId: { serviceId: f.serviceA.id, branchId: f.branchA.id } },
    data: { durationMinutes: 60 },
  });
  const configOverride = await availabilityService.resolveServiceBranchConfig(f.serviceA.id, f.branchA.id);
  assert(configOverride!.effectiveDurationMinutes === 60, 'Branch-level duration override: 45 → 60');
  // Reset
  await prisma.serviceBranchAssignment.update({
    where: { serviceId_branchId: { serviceId: f.serviceA.id, branchId: f.branchA.id } },
    data: { durationMinutes: null },
  });

  // ── 7. GET AVAILABLE SLOTS ────────────────────────────────────
  console.log('\n── 7. Get Available Slots ──');

  const slotsResult = await availabilityService.getAvailableSlots({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    date: TEST_DATE,
    source: 'INTERNAL',
  });
  assert(slotsResult.availableSlots.length > 0, 'Available slots returned for a valid request');
  assert(slotsResult.timezone === TZ, 'Response includes timezone');
  assert(slotsResult.branchId === f.branchA.id, 'Response includes branchId');
  // Slots should be in TZ with offset
  const firstSlot = slotsResult.availableSlots[0];
  assert(firstSlot.startTime.includes('+03:00') || firstSlot.startTime.includes('+03'), 'Slot startTime includes Addis timezone offset');
  // Staff info attached to each slot
  assert(firstSlot.staff?.id !== undefined, 'Slot includes staff info');
  // No slot should cross the break
  for (const slot of slotsResult.availableSlots) {
    const slotStart = DateTime.fromISO(slot.startTime);
    const slotEnd = DateTime.fromISO(slot.reservedEndTime);
    const breakStart = DateTime.fromISO(`${TEST_DATE}T13:00:00+03:00`);
    const breakEnd = DateTime.fromISO(`${TEST_DATE}T14:00:00+03:00`);
    const overlapsBreak = slotStart < breakEnd && breakStart < slotEnd;
    assert(!overlapsBreak || slot.staff.id !== f.staffHana.id, `Hana's slot doesn't overlap her 13:00-14:00 break`);
  }

  // ── 8. SALON_ASSIGNS determinism ─────────────────────────────
  console.log('\n── 8. Determinism ──');

  const slots1 = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: TEST_DATE, source: 'INTERNAL',
  });
  const slots2 = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: TEST_DATE, source: 'INTERNAL',
  });
  assert(
    JSON.stringify(slots1.availableSlots) === JSON.stringify(slots2.availableSlots),
    'Availability is deterministic: same input → same output'
  );

  // ── 9. CUSTOMER_CHOOSES ───────────────────────────────────────
  console.log('\n── 9. CUSTOMER_CHOOSES mode ──');

  // Without staffId → should throw
  await assertThrows(
    () => availabilityService.getAvailableSlots({
      businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceB.id, date: TEST_DATE, source: 'INTERNAL',
    }),
    'CUSTOMER_CHOOSES without staffId throws error'
  );

  // With valid staffId (Hana is qualified for serviceB)
  const customerChoosesSlots = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceB.id,
    date: TEST_DATE, staffId: f.staffHana.id, source: 'INTERNAL',
  });
  assert(customerChoosesSlots.availableSlots.length > 0, 'CUSTOMER_CHOOSES with valid staff returns slots');
  assert(
    customerChoosesSlots.availableSlots.every((s) => s.staff.id === f.staffHana.id),
    'CUSTOMER_CHOOSES: all slots belong to requested staff'
  );

  // With unqualified staffId (Sara not qualified for serviceB)
  await assertThrows(
    () => availabilityService.getAvailableSlots({
      businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceB.id,
      date: TEST_DATE, staffId: f.staffSara.id, source: 'INTERNAL',
    }),
    'CUSTOMER_CHOOSES with unqualified staff throws error'
  );

  // ── 10. ENTITY VALIDATION ─────────────────────────────────────
  console.log('\n── 10. Entity Validation ──');

  // Invalid business
  await assertThrows(
    () => availabilityService.getAvailableSlots({ businessId: 'nonexistent-id', branchId: f.branchA.id, serviceId: f.serviceA.id, date: TEST_DATE }),
    'Invalid businessId throws'
  );

  // Inactive branch
  await assertThrows(
    () => availabilityService.getAvailableSlots({ businessId: f.business.id, branchId: f.branchB.id, serviceId: f.serviceA.id, date: TEST_DATE }),
    'Inactive branch throws'
  );

  // Branch from other business
  await assertThrows(
    () => availabilityService.getAvailableSlots({ businessId: f.business.id, branchId: f.branchOther.id, serviceId: f.serviceA.id, date: TEST_DATE }),
    'Branch from another business throws'
  );

  // Service not available at branch
  const catB = await prisma.serviceCategory.create({ data: { businessId: f.business.id, name: 'Nails', status: 'ACTIVE' } });
  const svcNotAtBranch = await prisma.service.create({
    data: { businessId: f.business.id, categoryId: catB.id, name: 'Gel Nails', durationMinutes: 60, price: 200, employeeAssignmentMode: 'SALON_ASSIGNS', status: 'ACTIVE' },
  });
  await assertThrows(
    () => availabilityService.getAvailableSlots({ businessId: f.business.id, branchId: f.branchA.id, serviceId: svcNotAtBranch.id, date: TEST_DATE }),
    'Service not assigned to branch throws'
  );

  // Invalid date format
  await assertThrows(
    () => availabilityService.getAvailableSlots({ businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: 'not-a-date' }),
    'Invalid date format throws'
  );

  // ── 11. BOOKING POLICIES ──────────────────────────────────────
  console.log('\n── 11. Booking Policies ──');

  // Online booking disabled → empty slots for PUBLIC source
  await prisma.branchBookingConfig.update({
    where: { branchId: f.branchA.id },
    data: { onlineBookingEnabled: false },
  });
  const disabledSlots = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: TEST_DATE, source: 'PUBLIC',
  });
  assert(disabledSlots.availableSlots.length === 0, 'Online booking disabled: no public slots');
  // Restore
  await prisma.branchBookingConfig.update({ where: { branchId: f.branchA.id }, data: { onlineBookingEnabled: true } });

  // Date beyond max advance booking → empty
  await prisma.branchBookingConfig.update({ where: { branchId: f.branchA.id }, data: { maximumAdvanceBookingDays: 1 } });
  const farFutureSlots = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: TEST_DATE, source: 'PUBLIC',
  });
  assert(farFutureSlots.availableSlots.length === 0, 'Date beyond maxAdvanceDays: no slots returned');
  // Restore
  await prisma.branchBookingConfig.update({ where: { branchId: f.branchA.id }, data: { maximumAdvanceBookingDays: 60 } });

  // Past date → empty
  const pastSlots = await availabilityService.getAvailableSlots({
    businessId: f.business.id, branchId: f.branchA.id, serviceId: f.serviceA.id, date: '2020-01-01', source: 'PUBLIC',
  });
  assert(pastSlots.availableSlots.length === 0, 'Past date returns no slots (min advance violation)');

  // ── 12. VALIDATE SLOT ─────────────────────────────────────────
  console.log('\n── 12. Slot Validation ──');

  // Valid slot on TEST_DATE at 09:00
  const validSlotTime = `${TEST_DATE}T09:00:00+03:00`;
  const validationResult = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffHana.id,
    startTime: validSlotTime,
    source: 'INTERNAL',
  });
  assert(validationResult.valid === true, 'Valid slot is confirmed as valid');
  assert(validationResult.conflictType === undefined, 'No conflictType on valid slot');

  // Invalid: during Hana's break
  const breakSlotTime = `${TEST_DATE}T13:00:00+03:00`;
  const breakValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffHana.id,
    startTime: breakSlotTime,
    source: 'INTERNAL',
  });
  assert(breakValidation.valid === false, 'Slot during break is invalid');
  assert(breakValidation.overrideAllowed === true, 'Break conflict is overridable');
  assert(breakValidation.conflictType === 'STAFF_ON_BREAK', 'conflictType is STAFF_ON_BREAK');

  // Invalid: inactive staff
  const inactiveStaffValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffInactive.id,
    startTime: validSlotTime,
    source: 'INTERNAL',
  });
  assert(inactiveStaffValidation.valid === false, 'Inactive staff: invalid slot');
  assert(inactiveStaffValidation.overrideAllowed === false, 'Inactive staff: not overridable');
  assert(inactiveStaffValidation.conflictType === 'STAFF_INACTIVE', 'conflictType is STAFF_INACTIVE');

  // Invalid: outside branch hours
  const outsideHoursTime = `${TEST_DATE}T07:00:00+03:00`;
  const outsideHoursValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffHana.id,
    startTime: outsideHoursTime,
    source: 'INTERNAL',
  });
  assert(outsideHoursValidation.valid === false, 'Slot outside branch hours is invalid');
  assert(outsideHoursValidation.overrideAllowed === false, 'Outside branch hours: not overridable');
  assert(outsideHoursValidation.conflictType === 'SLOT_OUTSIDE_BRANCH_HOURS', 'conflictType is SLOT_OUTSIDE_BRANCH_HOURS');

  // Invalid: staff from different branch
  const staffOtherBiz = await prisma.staff.create({
    data: { businessId: f.business.id, branchId: f.branchB.id, firstName: 'Other', lastName: 'Branch', status: 'ACTIVE' },
  });
  const wrongBranchValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: staffOtherBiz.id,
    startTime: validSlotTime,
    source: 'INTERNAL',
  });
  assert(wrongBranchValidation.valid === false, 'Staff from wrong branch: invalid');
  assert(wrongBranchValidation.overrideAllowed === false, 'Staff from wrong branch: not overridable');
  assert(wrongBranchValidation.conflictType === 'STAFF_NOT_QUALIFIED', 'conflictType is STAFF_NOT_QUALIFIED (wrong branch)');

  // Invalid: past date (min advance violation)
  const pastTimeValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffHana.id,
    startTime: '2020-01-01T09:00:00+03:00',
    source: 'PUBLIC',
  });
  assert(pastTimeValidation.valid === false, 'Past time is invalid');
  assert(pastTimeValidation.conflictType === 'MIN_ADVANCE_VIOLATION', 'conflictType is MIN_ADVANCE_VIOLATION');

  // Invalid: staff not qualified for service
  const unqualifiedValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffSara.id,
    startTime: `${TEST_DATE}T10:00:00+03:00`,  // Sara works 10:00-16:00
    source: 'INTERNAL',
  });
  // Sara IS qualified for serviceA in our setup (we added her above), so this should be valid
  assert(unqualifiedValidation.valid === true, 'Sara qualified for serviceA: valid slot');

  // Sara NOT qualified for serviceB
  const saraNotQualifiedB = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceB.id,
    staffId: f.staffSara.id,
    startTime: `${TEST_DATE}T09:00:00+03:00`,
    source: 'INTERNAL',
  });
  assert(saraNotQualifiedB.valid === false, 'Sara not qualified for serviceB: invalid');
  assert(saraNotQualifiedB.conflictType === 'STAFF_NOT_QUALIFIED', 'conflictType is STAFF_NOT_QUALIFIED');

  // Invalid: invalid startTime format
  const invalidTimeValidation = await availabilityService.validateSlot({
    businessId: f.business.id,
    branchId: f.branchA.id,
    serviceId: f.serviceA.id,
    staffId: f.staffHana.id,
    startTime: 'not-a-time',
    source: 'INTERNAL',
  });
  assert(invalidTimeValidation.valid === false, 'Invalid startTime format: invalid');
  assert(invalidTimeValidation.conflictType === 'INVALID_START_TIME', 'conflictType is INVALID_START_TIME');

  // ── 13. CROSS-BUSINESS SECURITY ───────────────────────────────
  console.log('\n── 13. Cross-Business Security ──');

  await assertThrows(
    () => availabilityService.getAvailableSlots({
      businessId: f.bizOther.id,
      branchId: f.branchA.id, // belongs to f.business, not f.bizOther
      serviceId: f.serviceA.id,
      date: TEST_DATE,
    }),
    'Cross-business: branch from another business throws'
  );

  // ── CLEANUP ───────────────────────────────────────────────────
  await cleanup();

  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n💥 Test suite failed:', e.message);
    process.exit(1);
  });
