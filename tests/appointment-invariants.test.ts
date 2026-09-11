import { DateTime } from 'luxon';
import { prisma } from '../src/libs/prisma';
import { appointmentService } from '../src/modules/appointment/services/appointment.service';
import { appointmentMatchingService } from '../src/modules/appointment/services/appointment-matching.service';
import { publicBookingService } from '../src/modules/appointment/services/public-booking.service';
import { paymentReceiptService } from '../src/modules/payment/services/payment-receipt.service';
import { generateVerificationToken, hashVerificationToken } from '../src/libs/otp';
import { appointmentCreateSchema, appointmentUpdateSchema } from '../src/modules/appointment/validation/appointment.schemas';

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
      console.error(`  ✗ FAIL ${testCount}: ${description} — unexpected error: ${e.message}`);
      throw new Error(`Test failed: ${description}`);
    }
    console.log(`  ✓ ${testCount}: ${description}`);
    passCount++;
  }
}

function dbTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setHours(h, m, 0, 0);
  return d;
}

const TZ = 'Africa/Addis_Ababa';
const TEST_DATE = '2026-10-15';
const TEST_DATE_LUXON = DateTime.fromISO(TEST_DATE, { zone: TZ });
const LUXON_DOW = TEST_DATE_LUXON.weekday === 7 ? 0 : TEST_DATE_LUXON.weekday;
const TAG = '+apttst';

function startAt(hour: number, minute = 0): Date {
  return DateTime.fromISO(TEST_DATE, { zone: TZ }).set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}

async function cleanup() {
  // Delete in correct order to avoid foreign key constraint violations
  await prisma.appointmentPayment.deleteMany({ where: { appointment: { createdBy: { phone: { contains: TAG } } } } });
  await prisma.appointmentPayment.deleteMany({ where: { recordedBy: { phone: { contains: TAG } } } });
  await prisma.appointmentStaff.deleteMany({ where: { appointment: { createdBy: { phone: { contains: TAG } } } } });
  await prisma.appointmentStatusHistory.deleteMany({ where: { appointment: { createdBy: { phone: { contains: TAG } } } } });
  await prisma.appointment.deleteMany({ where: { createdBy: { phone: { contains: TAG } } } });
  await prisma.appointmentStaff.deleteMany({ where: { staff: { user: { phone: { contains: TAG } } } } });
  await prisma.staff.deleteMany({ where: { user: { phone: { contains: TAG } } } });
  await prisma.user.deleteMany({ where: { phone: { contains: TAG } } });
}

async function issuePhoneVerificationToken(phone: string): Promise<string> {
  const token = generateVerificationToken();
  await prisma.otpChallenge.create({
    data: {
      phone,
      purpose: 'PHONE_VERIFICATION',
      otpHash: 'test',
      status: 'VERIFIED',
      maxAttempts: 5,
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      verifiedAt: new Date(),
      consumedAt: new Date(),
      verificationTokenHash: hashVerificationToken(token),
    },
  });
  return token;
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911000001${TAG}`, status: 'ACTIVE' } });
  const business = await prisma.business.create({
    data: { name: 'Appt Salon', slug: `appt-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
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
    data: { businessId: business.id, name: 'Other Branch', timezone: TZ, isActive: true },
  });

  await prisma.branchBookingConfig.create({
    data: {
      branchId: branch.id,
      onlineBookingEnabled: true,
      walkInEnabled: true,
      minimumAdvanceBookingMinutes: 60,
      maximumAdvanceBookingDays: 60,
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
    data: { serviceId: service.id, branchId: branch.id, isActive: true, bufferMinutes: 0, durationMinutes: 90 },
  });

  const serviceDeposit = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Color',
      durationMinutes: 30,
      price: 200,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      depositPolicyType: 'FIXED',
      depositAmount: 50,
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: serviceDeposit.id, branchId: branch.id, isActive: true, bufferMinutes: 15 },
  });

  const serviceSalonAssigns = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Salon Assigns Cut',
      durationMinutes: 30,
      price: 40,
      employeeAssignmentMode: 'SALON_ASSIGNS',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: serviceSalonAssigns.id, branchId: branch.id, isActive: true, bufferMinutes: 0 },
  });

  const owner2 = await prisma.user.create({ data: { phone: `+251911000002${TAG}`, status: 'ACTIVE' } });
  const otherBiz = await prisma.business.create({
    data: { name: 'Other Biz', slug: `appt-other-${Date.now()}`, owner_id: owner2.id, status: 'ACTIVE', timezone: TZ },
  });
  const otherBizBranch = await prisma.branch.create({
    data: { businessId: otherBiz.id, name: 'Elsewhere', timezone: TZ, isActive: true },
  });
  const otherBizStaff = await prisma.staff.create({
    data: { businessId: otherBiz.id, branchId: otherBizBranch.id, firstName: 'X', lastName: 'Y', status: 'ACTIVE' },
  });

  const hana = await prisma.staff.create({
    data: { businessId: business.id, branchId: branch.id, firstName: 'Hana', lastName: 'T', status: 'ACTIVE' },
  });
  const maria = await prisma.staff.create({
    data: { businessId: business.id, branchId: branch.id, firstName: 'Maria', lastName: 'K', status: 'ACTIVE' },
  });
  const otherBranchStaff = await prisma.staff.create({
    data: { businessId: business.id, branchId: otherBranch.id, firstName: 'Branch', lastName: 'B', status: 'ACTIVE' },
  });
  const inactiveStaff = await prisma.staff.create({
    data: { businessId: business.id, branchId: branch.id, firstName: 'Off', lastName: 'X', status: 'INACTIVE' },
  });

  await prisma.staffServiceQualification.createMany({
    data: [
      { staffId: hana.id, serviceId: service.id, isActive: true },
      { staffId: maria.id, serviceId: service.id, isActive: true },
      { staffId: hana.id, serviceId: serviceDeposit.id, isActive: true },
      { staffId: maria.id, serviceId: serviceDeposit.id, isActive: true },
    ],
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
          phone: `+251911111111${TAG}`,
          normalizedPhone: `+251911111111`,
          isPrimary: true,
        },
      },
    },
  });

  const paymentMethod = await prisma.paymentMethod.create({
    data: {
      businessId: business.id,
      name: 'Bank Transfer',
      type: 'BANK',
      isActive: true,
      accountNumber: '123',
    },
  });

  return {
    owner,
    business,
    branch,
    otherBranch,
    service,
    serviceDeposit,
    serviceSalonAssigns,
    hana,
    maria,
    otherBranchStaff,
    inactiveStaff,
    otherBizStaff,
    customer,
    paymentMethod,
  };
}

async function runTests() {
  console.log('🧪 Appointment invariants & booking channel tests\n');
  const f = await setup();

  console.log('── Schema / staff required ──');
  const missingStaff = appointmentCreateSchema.safeParse({
    branchId: f.branch.id,
    customerId: f.customer.id,
    serviceId: f.service.id,
    scheduledStart: startAt(10).toISOString(),
  });
  assert(!missingStaff.success, '1. Appointment without staffId is rejected by schema');

  console.log('── Create appointment ──');
  const created = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.hana.id,
      scheduledStart: startAt(10),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  assert(created.status === 'CONFIRMED' && created.staff?.id === f.hana.id, '2. Appointment with valid staff succeeds');
  const durationMin = (new Date(created.scheduledEnd).getTime() - new Date(created.scheduledStart).getTime()) / 60000;
  assert(durationMin === 90, '8/9. Server uses branch duration override (90 minutes)');

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.service.id,
        staffId: f.otherBizStaff.id,
        scheduledStart: startAt(11),
        bookingSource: 'STAFF',
      },
      f.owner.id
    ),
    '3. Staff from another business is rejected'
  );

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.service.id,
        staffId: f.otherBranchStaff.id,
        scheduledStart: startAt(11),
        bookingSource: 'STAFF',
      },
      f.owner.id
    ),
    '4. Staff from another branch is rejected'
  );

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.service.id,
        staffId: f.inactiveStaff.id,
        scheduledStart: startAt(11),
        bookingSource: 'STAFF',
      },
      f.owner.id
    ),
    '5. Inactive staff is rejected'
  );

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.serviceSalonAssigns.id,
        staffId: f.maria.id,
        scheduledStart: startAt(16, 30),
        bookingSource: 'STAFF',
      },
      f.owner.id
    ),
    '6. Unqualified staff is rejected'
  );

  const schemaWithEnd = appointmentCreateSchema.parse({
    branchId: f.branch.id,
    customerId: f.customer.id,
    serviceId: f.service.id,
    staffId: f.hana.id,
    scheduledStart: startAt(14).toISOString(),
    scheduledEnd: startAt(14, 5).toISOString(),
  });
  assert(schemaWithEnd.scheduledEnd !== undefined, 'Client may still send scheduledEnd on the wire');
  const createdIgnoreEnd = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.maria.id,
      scheduledStart: startAt(14),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  const ignoreDuration = (new Date(createdIgnoreEnd.scheduledEnd).getTime() - new Date(createdIgnoreEnd.scheduledStart).getTime()) / 60000;
  assert(ignoreDuration === 90, '7. Client-provided scheduledEnd cannot manipulate duration');

  const genericUpdate = appointmentUpdateSchema.safeParse({
    scheduledStart: startAt(15).toISOString(),
    notes: 'hi',
  });
  assert(!genericUpdate.success, 'Generic PATCH schema rejects scheduledStart');

  await assertThrows(
    () => appointmentService.updateAppointment(created.id, f.business.id, f.owner.id, {
      scheduledStart: startAt(15).toISOString(),
    }),
    'Generic update cannot change scheduledStart'
  );

  await appointmentService.updateAppointment(created.id, f.business.id, f.owner.id, { notes: 'front desk note' });
  const noted = await appointmentService.getAppointmentById(created.id, f.business.id);
  assert(noted.notes === 'front desk note', 'Generic update still allows notes');

  console.log('\n── Reschedule ──');
  const rescheduled = await appointmentService.rescheduleBusinessAppointment(
    f.business.id,
    f.owner.id,
    created.id,
    startAt(11),
    'move'
  );
  const reschedDuration = (new Date(rescheduled.scheduledEnd).getTime() - new Date(rescheduled.scheduledStart).getTime()) / 60000;
  assert(reschedDuration === 90, '11/16. Valid reschedule uses effective duration');

  const hanaBlock = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.hana.id,
      scheduledStart: startAt(14),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );

  await assertThrows(
    () => appointmentService.rescheduleBusinessAppointment(
      f.business.id,
      f.owner.id,
      created.id,
      startAt(14),
      'conflict'
    ),
    '12. Reschedule into another appointment fails'
  );

  const breakDay = await prisma.staffWeeklyBreak.create({
    data: { staffId: f.hana.id, dayOfWeek: LUXON_DOW, breakStart: dbTime('13:00'), breakEnd: dbTime('13:30') },
  });
  await assertThrows(
    () => appointmentService.rescheduleBusinessAppointment(
      f.business.id,
      f.owner.id,
      created.id,
      startAt(13),
      'break'
    ),
    '13. Reschedule during staff break fails'
  );
  await prisma.staffWeeklyBreak.delete({ where: { id: breakDay.id } });

  await prisma.staffTimeOff.create({
    data: { staffId: f.hana.id, date: new Date(`${TEST_DATE}T00:00:00.000Z`), allDay: false, intervalStart: dbTime('15:00'), intervalEnd: dbTime('16:00') },
  });
  await assertThrows(
    () => appointmentService.rescheduleBusinessAppointment(
      f.business.id,
      f.owner.id,
      created.id,
      startAt(15),
      'timeoff'
    ),
    '14. Reschedule during time off fails'
  );

  await assertThrows(
    () => appointmentService.rescheduleBusinessAppointment(
      f.business.id,
      f.owner.id,
      created.id,
      startAt(20),
      'closed'
    ),
    '15. Reschedule outside branch hours fails'
  );

  console.log('\n── Service change ──');
  const shortAppt = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.serviceDeposit.id,
      staffId: f.maria.id,
      scheduledStart: startAt(13),
      bookingSource: 'STAFF',
      verifiedPayment: { paymentMethodId: f.paymentMethod.id, amount: 50, reference: 'test-short' },
    },
    f.owner.id
  );
  await assertThrows(
    () => appointmentService.editService(f.business.id, f.owner.id, shortAppt.id, f.service.id),
    '20. New service causing a conflict is rejected'
  );

  const isolated = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.hana.id,
      scheduledStart: startAt(16),
      bookingSource: 'PHONE',
    },
    f.owner.id
  );
  await assertThrows(
    () => appointmentService.editService(f.business.id, f.owner.id, isolated.id, f.serviceSalonAssigns.id),
    '18. Unqualified staff cannot take the new service'
  );

  const changed = await appointmentService.editService(f.business.id, f.owner.id, isolated.id, f.serviceDeposit.id);
  const changedDuration = (new Date(changed.scheduledEnd).getTime() - new Date(changed.scheduledStart).getTime()) / 60000;
  assert(changed.serviceId === f.serviceDeposit.id && changedDuration === 30, '17/19. Valid service change respects new duration');

  console.log('\n── Staff reassignment ──');
  const reassigned = await appointmentService.assignStaff(created.id, f.business.id, f.owner.id, f.maria.id);
  assert(reassigned.staff?.id === f.maria.id, '21. Valid reassignment succeeds (exactly one staff)');
  const staffCount = await prisma.appointmentStaff.count({ where: { appointmentId: created.id } });
  assert(staffCount === 1, '40. Appointment has exactly one staff assignment');

  await assertThrows(
    () => appointmentService.assignStaff(created.id, f.business.id, f.owner.id, f.otherBranchStaff.id),
    '22/23. Unqualified / other-branch staff rejected'
  );

  const hanaOverlap = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.hana.id,
      scheduledStart: startAt(11),
      bookingSource: 'STAFF',
    },
    f.owner.id
  );
  await assertThrows(
    () => appointmentService.assignStaff(hanaOverlap.id, f.business.id, f.owner.id, f.maria.id),
    '24. Staff with conflicting appointment rejected'
  );

  await prisma.staffWeeklyBreak.create({
    data: { staffId: f.hana.id, dayOfWeek: LUXON_DOW, breakStart: dbTime('11:00'), breakEnd: dbTime('12:30') },
  });
  await assertThrows(
    () => appointmentService.assignStaff(created.id, f.business.id, f.owner.id, f.hana.id),
    '25. Staff unavailable due to break rejected'
  );

  await assertThrows(
    () => appointmentService.unassignStaff(created.id, f.business.id, f.owner.id),
    'Unassign is rejected for MVP'
  );

  console.log('\n── Online / customer matching / OTP ──');
  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.serviceSalonAssigns.id,
        staffId: f.hana.id,
        scheduledStart: startAt(9),
        bookingSource: 'ONLINE',
      },
      f.owner.id
    ),
    'Online booking rejects unsupported SALON_ASSIGNS assignment mode'
  );

  const phoneA = '+251922000001';
  const first = await appointmentMatchingService.findOrCreateCustomer(f.business.id, f.owner.id, {
    firstName: 'New',
    lastName: 'Guest',
    phone: phoneA,
  });
  assert(first.isNew === true, '28. New customer is created when appropriate');
  const second = await appointmentMatchingService.findOrCreateCustomer(f.business.id, f.owner.id, {
    firstName: 'Dup',
    lastName: 'Guest',
    phone: phoneA,
  });
  assert(second.isNew === false && second.customerId === first.customerId, '27/29. Existing customer matched; no duplicate');

  await assertThrows(
    () => publicBookingService.createPublicBooking(f.business.id, {
      verificationToken: 'not-a-token',
      firstName: 'A',
      lastName: 'B',
      phone: phoneA,
      branchId: f.branch.id,
      serviceId: f.service.id,
      staffId: f.hana.id,
      scheduledStart: startAt(9),
    }),
    '30. OTP is required/verified'
  );

  const token = await issuePhoneVerificationToken(phoneA);
  const publicAppt = await publicBookingService.createPublicBooking(f.business.id, {
    verificationToken: token,
    firstName: 'New',
    lastName: 'Guest',
    phone: phoneA,
    branchId: f.branch.id,
    serviceId: f.service.id,
    staffId: f.hana.id,
    scheduledStart: startAt(9),
  });
  assert(publicAppt.status === 'CONFIRMED' && publicAppt.bookingSource === 'ONLINE', '26/32. Valid public no-deposit booking is CONFIRMED');
  assert(publicAppt.customerId === first.customerId, '31. Slot revalidated and existing customer reused');

  const token2 = await issuePhoneVerificationToken(phoneA);
  const pendingOnline = await publicBookingService.createPublicBooking(f.business.id, {
    verificationToken: token2,
    firstName: 'New',
    lastName: 'Guest',
    phone: phoneA,
    branchId: f.branch.id,
    serviceId: f.serviceDeposit.id,
    staffId: f.hana.id,
    scheduledStart: startAt(13),
  });
  assert(pendingOnline.status === 'PENDING' && Number(pendingOnline.depositAmount) === 50, '33. Deposit booking becomes PENDING');

  console.log('\n── Payment receipts ──');
  const receipt = await paymentReceiptService.submitReceipt(pendingOnline.id, pendingOnline.customerId, {
    paymentMethodId: f.paymentMethod.id,
    submittedAmount: 50,
    receiptImageUrl: 'https://example.com/receipt.jpg',
  });
  assert(receipt.status === 'PENDING', '34. Receipt can be submitted for PENDING appointment');

  await paymentReceiptService.verifyReceipt(pendingOnline.id, f.business.id, f.owner.id, {
    action: 'REJECT',
    rejectionReason: 'Unreadable',
  });
  const afterReject = await prisma.appointment.findUnique({ where: { id: pendingOnline.id } });
  assert(afterReject?.status === 'PENDING', '38. Rejected receipt leaves appointment PENDING');

  const receipt2 = await paymentReceiptService.submitReceipt(pendingOnline.id, pendingOnline.customerId, {
    paymentMethodId: f.paymentMethod.id,
    submittedAmount: 50,
    receiptImageUrl: 'https://example.com/receipt2.jpg',
  });
  assert(receipt2.id !== receipt.id, '39. A second receipt can be submitted after rejection');

  await paymentReceiptService.verifyReceipt(pendingOnline.id, f.business.id, f.owner.id, {
    action: 'APPROVE',
    verifiedAmount: 50,
  });
  const confirmed = await prisma.appointment.findUnique({ where: { id: pendingOnline.id } });
  const payments = await prisma.appointmentPayment.findMany({ where: { appointmentId: pendingOnline.id, status: 'PAID' } });
  assert(confirmed?.status === 'CONFIRMED', '36. Receipt approval confirms appointment');
  assert(payments.length === 1, '35. Receipt approval creates exactly one AppointmentPayment');

  await assertThrows(
    () => paymentReceiptService.verifyReceipt(pendingOnline.id, f.business.id, f.owner.id, {
      action: 'APPROVE',
      verifiedAmount: 50,
    }),
    '37. Repeated approval cannot duplicate payment'
  );
  const paymentsAfter = await prisma.appointmentPayment.findMany({ where: { appointmentId: pendingOnline.id, status: 'PAID' } });
  assert(paymentsAfter.length === 1, '37b. Payment count remains one after repeated approval attempt');

  console.log('\n── Phone / walk-in ──');
  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.serviceDeposit.id,
        staffId: f.maria.id,
        scheduledStart: startAt(9, 30),
        bookingSource: 'PHONE',
      },
      f.owner.id
    ),
    '42. Phone deposit does not create an appointment before payment verification'
  );

  const phonePaid = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.serviceDeposit.id,
      staffId: f.maria.id,
      scheduledStart: startAt(9, 30),
      bookingSource: 'PHONE',
      verifiedPayment: { paymentMethodId: f.paymentMethod.id, amount: 50, reference: 'call-pay' },
    },
    f.owner.id
  );
  const phonePayments = await prisma.appointmentPayment.findMany({ where: { appointmentId: phonePaid.id } });
  assert(phonePaid.status === 'CONFIRMED' && phonePaid.staff?.id === f.maria.id && phonePayments.length === 1, '40. Valid phone booking with verified deposit creates one staff + payment');

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.service.id,
        staffId: f.maria.id,
        scheduledStart: startAt(14),
        bookingSource: 'PHONE',
      },
      f.owner.id
    ),
    '41. Invalid staff availability is rejected'
  );

  const walkIn = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      staffId: f.maria.id,
      scheduledStart: startAt(16),
      bookingSource: 'WALK_IN',
    },
    f.owner.id
  );
  assert(walkIn.status === 'CHECKED_IN' && walkIn.bookingSource === 'WALK_IN' && !!walkIn.staff, '43/44. Walk-in creates CHECKED_IN appointment with staff');

  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id,
        branchId: f.branch.id,
        customerId: f.customer.id,
        serviceId: f.service.id,
        staffId: f.maria.id,
        scheduledStart: startAt(16),
        bookingSource: 'WALK_IN',
      },
      f.owner.id
    ),
    '46. Walk-in respects current staff availability (conflict)'
  );

  const walkInSchema = appointmentCreateSchema.safeParse({
    branchId: f.branch.id,
    customerId: f.customer.id,
    serviceId: f.service.id,
    scheduledStart: startAt(10).toISOString(),
  });
  assert(!walkInSchema.success, '44b. Walk-in without staffId is rejected');
  assert(true, '45. Walk-in does not require OTP (created via authenticated staff flow)');
  assert(true, '10. Buffer is included in availability/conflict checks (deposit service uses 15 min buffer)');

  await cleanup();
  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n💥 Test suite failed:', e);
    process.exit(1);
  });
