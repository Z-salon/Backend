import { DateTime } from 'luxon';
import { prisma } from '../src/libs/prisma';
import { appointmentService } from '../src/modules/appointment/services/appointment.service';
import { appointmentPaymentService } from '../src/modules/payment/services/appointment-payment.service';
import { paymentReceiptService } from '../src/modules/payment/services/payment-receipt.service';
import { refundRequestService } from '../src/modules/payment/services/refund-request.service';

/**
 * Finance correctness tests: payments -> outstanding -> refund lifecycle.
 * Run: npx ts-node tests/finance-refund.test.ts
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

const TZ = 'Africa/Addis_Ababa';
const TEST_DATE = '2026-10-15';
const TEST_DATE_LUXON = DateTime.fromISO(TEST_DATE, { zone: TZ });
const LUXON_DOW = TEST_DATE_LUXON.weekday === 7 ? 0 : TEST_DATE_LUXON.weekday;
const TAG = '+fintst';

function startAt(hour: number, minute = 0): Date {
  return DateTime.fromISO(TEST_DATE, { zone: TZ }).set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
}
function dbTime(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setHours(h, m, 0, 0);
  return d;
}
function num(v: any): number {
  return v == null ? 0 : Number(v.toString());
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { contains: TAG } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) return;
  const businesses = await prisma.business.findMany({ where: { owner_id: { in: userIds } }, select: { id: true } });
  const businessIds = businesses.map((b) => b.id);

  const appts = { businessId: { in: businessIds } };
  await prisma.refundRequest.deleteMany({ where: { appointment: appts } });
  await prisma.paymentReceipt.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.appointmentPayment.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.appointmentStaff.deleteMany({ where: { appointment: appts } });
  await prisma.appointmentStatusHistory.deleteMany({ where: { appointment: appts } });
  await prisma.feedbackRequest.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.staffServiceQualification.deleteMany({ where: { staff: { businessId: { in: businessIds } } } });
  await prisma.staff.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.serviceBranchAssignment.deleteMany({ where: { service: { businessId: { in: businessIds } } } });
  await prisma.service.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.serviceCategoryBranchAssignment.deleteMany({ where: { category: { businessId: { in: businessIds } } } });
  await prisma.serviceCategory.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.branchWeeklyHourInterval.deleteMany({ where: { weeklySchedule: { branch: { businessId: { in: businessIds } } } } });
  await prisma.branchWeeklySchedule.deleteMany({ where: { branch: { businessId: { in: businessIds } } } });
  await prisma.branchBookingConfig.deleteMany({ where: { branch: { businessId: { in: businessIds } } } });
  await prisma.paymentMethod.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.customerPhone.deleteMany({ where: { customer: { businessId: { in: businessIds } } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.branch.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.userRole.deleteMany({ where: { businessMember: { businessId: { in: businessIds } } } });
  await prisma.businessMember.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.role.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditLog.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911000001${TAG}`, status: 'ACTIVE' } });
  const business = await prisma.business.create({
    data: { name: 'Finance Salon', slug: `fin-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });
  const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const membership = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({ data: { businessMemberId: membership.id, roleId: ownerRole.id, scopeType: 'BUSINESS' } });

  const branch = await prisma.branch.create({ data: { businessId: business.id, name: 'Main', timezone: TZ, isActive: true } });
  const bookingConfig = await prisma.branchBookingConfig.create({
    data: {
      branchId: branch.id,
      onlineBookingEnabled: true,
      walkInEnabled: true,
      minimumAdvanceBookingMinutes: 60,
      maximumAdvanceBookingDays: 120,
      refundPolicyType: 'FULL_REFUND',
      refundPercentage: 50,
      refundDeadlineHours: 24,
    },
  });
  const weekly = await prisma.branchWeeklySchedule.create({
    data: { branchId: branch.id, dayOfWeek: LUXON_DOW, isClosed: false },
  });
  await prisma.branchWeeklyHourInterval.create({
    data: { weeklyScheduleId: weekly.id, startTime: dbTime('09:00'), endTime: dbTime('18:00') },
  });

  const category = await prisma.serviceCategory.create({ data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' } });
  await prisma.serviceCategoryBranchAssignment.create({ data: { categoryId: category.id, branchId: branch.id, isActive: true } });

  const serviceNoDeposit = await prisma.service.create({
    data: {
      businessId: business.id, categoryId: category.id, name: 'Trim', durationMinutes: 30, price: 1000,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES', depositPolicyType: 'NONE', status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({ data: { serviceId: serviceNoDeposit.id, branchId: branch.id, isActive: true, bufferMinutes: 0 } });

  const serviceDeposit = await prisma.service.create({
    data: {
      businessId: business.id, categoryId: category.id, name: 'Color', durationMinutes: 30, price: 1000,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES', depositPolicyType: 'FIXED', depositAmount: 300, status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({ data: { serviceId: serviceDeposit.id, branchId: branch.id, isActive: true, bufferMinutes: 0 } });

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id, firstName: 'Abebe', lastName: 'Kebede', status: 'ACTIVE', createdById: owner.id,
      phones: { create: { businessId: business.id, phone: `+251911111111${TAG}`, normalizedPhone: '+251911111111', isPrimary: true } },
    },
  });

  const paymentMethod = await prisma.paymentMethod.create({
    data: { businessId: business.id, name: 'Cash', type: 'CASH', isActive: true },
  });

  return { owner, business, branch, bookingConfig, category, serviceNoDeposit, serviceDeposit, customer, paymentMethod };
}

type F = Awaited<ReturnType<typeof setup>>;

let staffSeq = 0;
async function newStaff(f: F) {
  staffSeq++;
  const staff = await prisma.staff.create({
    data: { businessId: f.business.id, branchId: f.branch.id, firstName: `S${staffSeq}`, lastName: 'T', status: 'ACTIVE' },
  });
  await prisma.staffServiceQualification.createMany({
    data: [
      { staffId: staff.id, serviceId: f.serviceNoDeposit.id, isActive: true },
      { staffId: staff.id, serviceId: f.serviceDeposit.id, isActive: true },
    ],
  });
  return staff;
}

/** Walk-in appointment (CHECKED_IN) with a fresh staff member, optionally paid. */
async function walkIn(f: F, opts: { paid?: number; withFinal?: number; serviceId?: string } = {}) {
  const staff = await newStaff(f);
  const appt = await appointmentService.createAppointment(
    {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: opts.serviceId ?? f.serviceNoDeposit.id,
      staffId: staff.id,
      scheduledStart: startAt(10),
      bookingSource: 'WALK_IN',
    },
    f.owner.id
  );
  if (opts.paid && opts.paid > 0) {
    await appointmentPaymentService.createPayment(appt.id, f.business.id, f.owner.id, {
      paymentMethodId: f.paymentMethod.id,
      amount: opts.paid,
    });
  }
  if (opts.withFinal != null) {
    await appointmentService.setFinalAgreedAmount(appt.id, f.business.id, f.owner.id, opts.withFinal);
  }
  return appt;
}

/** Raw PENDING appointment (no slot validation) for receipt tests. */
async function rawPending(f: F, totalAmount: number, depositAmount?: number) {
  return prisma.appointment.create({
    data: {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.serviceDeposit.id,
      scheduledStart: startAt(15),
      scheduledEnd: startAt(16),
      status: 'PENDING',
      totalAmount,
      depositAmount: depositAmount ?? null,
      bookingSource: 'ONLINE',
      createdById: f.owner.id,
      refundPolicyType: 'FULL_REFUND',
      refundPercentage: 50,
      refundDeadlineHours: 24,
    },
  });
}

async function runTests() {
  console.log('\n💳 Finance: payments, outstanding & refunds\n');
  const f = await setup();

  // ─── Payments ────────────────────────────────────────────────
  console.log('── Payments ──');
  const noDep = await walkIn(f);
  assert(noDep.depositAmount === null, '1. No deposit required -> no deposit amount');
  const fin1 = await appointmentPaymentService.getAppointmentFinancials(noDep.id, f.business.id);
  assert(num(fin1.verifiedPaid) === 0 && num(fin1.outstanding) === 0, '1b. New unfinalized appointment creates no debt');

  const staffDep = await newStaff(f);
  await assertThrows(
    () => appointmentService.createAppointment(
      {
        businessId: f.business.id, branchId: f.branch.id, customerId: f.customer.id,
        serviceId: f.serviceDeposit.id, staffId: staffDep.id, scheduledStart: startAt(10), bookingSource: 'PHONE',
      },
      f.owner.id
    ),
    '2. Deposit required -> phone booking without verified payment is rejected'
  );
  const depAppt = await appointmentService.createAppointment(
    {
      businessId: f.business.id, branchId: f.branch.id, customerId: f.customer.id,
      serviceId: f.serviceDeposit.id, staffId: staffDep.id, scheduledStart: startAt(10), bookingSource: 'PHONE',
      verifiedPayment: { paymentMethodId: f.paymentMethod.id, amount: 300, reference: 'dep' },
    },
    f.owner.id
  );
  const depFin = await appointmentPaymentService.getAppointmentFinancials(depAppt.id, f.business.id);
  assert(num(depFin.verifiedPaid) === 300, '2b. Deposit required -> verified payment of 300 recorded');

  // Pending / rejected receipts
  const pend = await rawPending(f, 300, 300);
  await paymentReceiptService.submitReceipt(pend.id, pend.customerId, {
    paymentMethodId: f.paymentMethod.id, submittedAmount: 300, receiptImageUrl: 'https://example.com/r.jpg', receiptImagePublicId: 'r',
  });
  let recFin = await appointmentPaymentService.getAppointmentFinancials(pend.id, f.business.id);
  assert(num(recFin.verifiedPaid) === 0, '3. Pending receipt does not count as paid');

  await paymentReceiptService.verifyReceipt(pend.id, f.business.id, f.owner.id, { action: 'REJECT', rejectionReason: 'blurry' });
  recFin = await appointmentPaymentService.getAppointmentFinancials(pend.id, f.business.id);
  assert(num(recFin.verifiedPaid) === 0, '4. Rejected receipt does not count as paid');

  const pendApprove = await rawPending(f, 300, 300);
  await paymentReceiptService.submitReceipt(pendApprove.id, pendApprove.customerId, {
    paymentMethodId: f.paymentMethod.id, submittedAmount: 300, receiptImageUrl: 'https://example.com/r2.jpg', receiptImagePublicId: 'r2',
  });
  await paymentReceiptService.verifyReceipt(pendApprove.id, f.business.id, f.owner.id, { action: 'APPROVE', verifiedAmount: 300 });
  let payCount = await prisma.appointmentPayment.count({ where: { appointmentId: pendApprove.id, status: 'PAID' } });
  assert(payCount === 1, '5. Approved receipt creates exactly one payment');

  await assertThrows(
    () => paymentReceiptService.verifyReceipt(pendApprove.id, f.business.id, f.owner.id, { action: 'APPROVE', verifiedAmount: 300 }),
    '6. Duplicate approval does not create a second payment'
  );
  payCount = await prisma.appointmentPayment.count({ where: { appointmentId: pendApprove.id } });
  assert(payCount === 1, '6b. Payment count remains one after duplicate approval attempt');

  const multi = await walkIn(f, { paid: 300 });
  await appointmentPaymentService.createPayment(multi.id, f.business.id, f.owner.id, { paymentMethodId: f.paymentMethod.id, amount: 400 });
  const multiFin = await appointmentPaymentService.getAppointmentFinancials(multi.id, f.business.id);
  assert(num(multiFin.verifiedPaid) === 700, '7. Multiple verified payments sum correctly');

  const voided = await walkIn(f, { paid: 500 });
  const vp = await prisma.appointmentPayment.findFirst({ where: { appointmentId: voided.id } });
  await appointmentPaymentService.voidPayment(vp!.id, f.business.id, f.owner.id, 'mistake');
  const voidedFin = await appointmentPaymentService.getAppointmentFinancials(voided.id, f.business.id);
  assert(num(voidedFin.verifiedPaid) === 0, '8. Voided payment does not count as paid');

  // ─── Outstanding ─────────────────────────────────────────────
  console.log('\n── Outstanding ──');
  const o9 = await walkIn(f, { withFinal: 1000 });
  const o9fin = await appointmentPaymentService.getAppointmentFinancials(o9.id, f.business.id);
  assert(num(o9fin.outstanding) === 1000, '9. Final 1000 / paid 0 -> outstanding 1000');

  const o10 = await walkIn(f, { paid: 300, withFinal: 1000 });
  const o10fin = await appointmentPaymentService.getAppointmentFinancials(o10.id, f.business.id);
  assert(num(o10fin.outstanding) === 700, '10. Final 1000 / paid 300 -> outstanding 700');

  const o11 = await walkIn(f, { paid: 1000, withFinal: 1000 });
  const o11fin = await appointmentPaymentService.getAppointmentFinancials(o11.id, f.business.id);
  assert(num(o11fin.outstanding) === 0, '11. Final 1000 / paid 1000 -> outstanding 0');

  const o12 = await walkIn(f, { paid: 300, withFinal: 1000 });
  await appointmentPaymentService.createPayment(o12.id, f.business.id, f.owner.id, { paymentMethodId: f.paymentMethod.id, amount: 400 });
  const o12fin = await appointmentPaymentService.getAppointmentFinancials(o12.id, f.business.id);
  assert(num(o12fin.outstanding) === 300, '12. Final 1000 / payments 300 + 400 -> outstanding 300');

  const o13 = await walkIn(f, { withFinal: 1000 });
  const o13receipt = await prisma.paymentReceipt.create({
    data: {
      appointmentId: o13.id, customerId: f.customer.id, businessId: f.business.id, branchId: f.branch.id,
      paymentMethodId: f.paymentMethod.id, expectedAmount: 1000, submittedAmount: 1000,
      receiptImageUrl: 'https://example.com/o13.jpg', status: 'PENDING',
    },
  });
  const o13fin = await appointmentPaymentService.getAppointmentFinancials(o13.id, f.business.id);
  assert(num(o13fin.outstanding) === 1000, '13. Pending receipt does not reduce outstanding');

  const cust = await appointmentPaymentService.getCustomerOutstanding(f.business.id, f.customer.id, f.owner.id);
  // Finalized appointments so far: o9(1000) + o10(700) + o11(0) + o12(300) + o13(1000) = 3000.
  assert(num(cust.totalOutstanding) === 3000, '14. Customer outstanding aggregates multiple appointments');

  // ─── Refunds ─────────────────────────────────────────────────
  console.log('\n── Refunds ──');

  // 15. NO_REFUND rejects
  await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'NO_REFUND' } });
  const noRef = await walkIn(f, { paid: 500 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, noRef.id, false);
  await assertThrows(
    () => refundRequestService.createRefundRequest(noRef.id, f.business.id, f.owner.id, { amount: 500 }),
    '15. NO_REFUND policy rejects a refund request'
  );
  await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND' } });

  // 16. Eligible refund creates PENDING
  const r16 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r16.id, false);
  const rr16 = await refundRequestService.createRefundRequest(r16.id, f.business.id, f.owner.id, { amount: 400, reason: 'partial' });
  assert(rr16.status === 'PENDING' && num(rr16.requestedAmount) === 400, '16. Eligible refund creates a PENDING request');

  // 17. Requested amount cannot exceed refundable
  await assertThrows(
    () => refundRequestService.createRefundRequest(r16.id, f.business.id, f.owner.id, { amount: 700 }),
    '17. Requested amount cannot exceed the refundable amount'
  );

  // 18. Pending payment cannot be refunded
  const r18 = await rawPending(f, 300, 300);
  await paymentReceiptService.submitReceipt(r18.id, r18.customerId, {
    paymentMethodId: f.paymentMethod.id, submittedAmount: 300, receiptImageUrl: 'https://example.com/r18.jpg', receiptImagePublicId: 'r18',
  });
  await prisma.appointment.update({ where: { id: r18.id }, data: { status: 'CANCELLED' } });
  await assertThrows(
    () => refundRequestService.createRefundRequest(r18.id, f.business.id, f.owner.id, { amount: 300 }),
    '18. An unverified (pending) payment cannot be refunded'
  );

  // 19. Rejected request does not change financial balance
  const r19 = await walkIn(f, { paid: 500 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r19.id, false);
  const rr19 = await refundRequestService.createRefundRequest(r19.id, f.business.id, f.owner.id, { amount: 500 });
  await refundRequestService.rejectRefund(rr19.id, f.business.id, f.owner.id, 'not eligible');
  const fin19 = await appointmentPaymentService.getAppointmentFinancials(r19.id, f.business.id);
  assert(num(fin19.refunded) === 0 && num(fin19.verifiedPaid) === 500, '19. Rejected refund does not change the financial balance');

  await assertThrows(
    async () => {
      const fresh = await refundRequestService.createRefundRequest(r19.id, f.business.id, f.owner.id, { amount: 500 });
      await refundRequestService.rejectRefund(fresh.id, f.business.id, f.owner.id, undefined);
    },
    '19b. Rejection requires a reason'
  );

  // 20/21/22. Approve then complete
  const r20 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r20.id, false);
  const rr20 = await refundRequestService.createRefundRequest(r20.id, f.business.id, f.owner.id, { amount: 300 });
  const approved20 = await refundRequestService.approveRefund(rr20.id, f.business.id, f.owner.id, 300);
  assert(
    approved20.status === 'APPROVED' && num(approved20.approvedAmount) === 300 && approved20.reviewedById === f.owner.id,
    '20. Approval records approved amount and reviewer'
  );
  assert(num((await prisma.appointmentPayment.findFirst({ where: { appointmentId: r20.id } }))!.refundedAmount) === 0,
    '21. APPROVED alone does not return money (not completed)');
  const completed20 = await refundRequestService.completeRefund(rr20.id, f.business.id, f.owner.id, { reference: 'TX-1' });
  const fin20 = await appointmentPaymentService.getAppointmentFinancials(r20.id, f.business.id);
  assert(completed20.status === 'COMPLETED' && !!completed20.completedAt && num(fin20.refunded) === 300,
    '22. Approved -> completed records who/when/amount and applies the refund');

  // 23. Rejected -> completed fails
  const r23 = await walkIn(f, { paid: 500 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r23.id, false);
  const rr23 = await refundRequestService.createRefundRequest(r23.id, f.business.id, f.owner.id, { amount: 500 });
  await refundRequestService.rejectRefund(rr23.id, f.business.id, f.owner.id, 'no');
  await assertThrows(
    () => refundRequestService.completeRefund(rr23.id, f.business.id, f.owner.id, {}),
    '23. REJECTED -> COMPLETED is not allowed'
  );

  // 24. Completed refund cannot exceed approved amount
  const r24 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r24.id, false);
  const rr24 = await refundRequestService.createRefundRequest(r24.id, f.business.id, f.owner.id, { amount: 400 });
  await refundRequestService.approveRefund(rr24.id, f.business.id, f.owner.id, 400);
  await assertThrows(
    () => refundRequestService.completeRefund(rr24.id, f.business.id, f.owner.id, { amount: 500 }),
    '24. Completed refund cannot exceed the approved amount'
  );

  // 25. Duplicate completion prevented (different amount), idempotent for same amount
  await refundRequestService.completeRefund(rr24.id, f.business.id, f.owner.id, { amount: 400, reference: 'TX-24' });
  const again = await refundRequestService.completeRefund(rr24.id, f.business.id, f.owner.id, { amount: 400 });
  assert(again.status === 'COMPLETED', '25. Duplicate completion with same amount is idempotent');
  await assertThrows(
    () => refundRequestService.completeRefund(rr24.id, f.business.id, f.owner.id, { amount: 100 }),
    '25b. Duplicate completion with a different amount is rejected'
  );

  // 26. Partial refund works (amount less than approved)
  const r26 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r26.id, false);
  const rr26 = await refundRequestService.createRefundRequest(r26.id, f.business.id, f.owner.id, { amount: 600 });
  await refundRequestService.approveRefund(rr26.id, f.business.id, f.owner.id, 600);
  await refundRequestService.completeRefund(rr26.id, f.business.id, f.owner.id, { amount: 250 });
  const fin26 = await appointmentPaymentService.getAppointmentFinancials(r26.id, f.business.id);
  assert(num(fin26.refunded) === 250, '26. Partial refund completes for less than the approved amount');

  // 27. Multiple legitimate refund requests cannot corrupt refundable amount
  const r27 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r27.id, false);
  await refundRequestService.createRefundRequest(r27.id, f.business.id, f.owner.id, { amount: 600 });
  const rr27b = await refundRequestService.createRefundRequest(r27.id, f.business.id, f.owner.id, { amount: 400 });
  assert(num(rr27b.requestedAmount) === 400, '27. Two legitimate requests within the balance are allowed');
  await assertThrows(
    () => refundRequestService.createRefundRequest(r27.id, f.business.id, f.owner.id, { amount: 100 }),
    '27b. A third request exceeding the remaining balance is rejected'
  );

  // 28. Concurrent refund attempts cannot over-refund
  const r28 = await walkIn(f, { paid: 1000 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r28.id, false);
  const settled = await Promise.allSettled([
    refundRequestService.createRefundRequest(r28.id, f.business.id, f.owner.id, { amount: 1000 }),
    refundRequestService.createRefundRequest(r28.id, f.business.id, f.owner.id, { amount: 1000 }),
  ]);
  const okCount = settled.filter((s) => s.status === 'fulfilled').length;
  const reserved = await prisma.refundRequest.aggregate({
    where: { appointmentId: r28.id, status: { in: ['PENDING', 'APPROVED'] } },
    _sum: { requestedAmount: true },
  });
  assert(okCount === 1 && num(reserved._sum.requestedAmount) <= 1000, '28. Concurrent refund attempts cannot over-refund a payment');

  // ─── Historical behaviour ────────────────────────────────────
  console.log('\n── Historical behaviour ──');
  // 29. Changing current refund policy does not alter old appointment history
  await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND' } });
  const r29 = await walkIn(f, { paid: 800 });
  await appointmentService.cancelAppointment(f.business.id, f.owner.id, r29.id, false);
  await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'NO_REFUND' } });
  const rr29 = await refundRequestService.createRefundRequest(r29.id, f.business.id, f.owner.id, { amount: 800 });
  assert(rr29.status === 'PENDING', '29. Changing current policy does not change old appointment refund eligibility');
  await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND' } });

  // 30. Original payment remains visible after refund
  const r30paymentAfter = await prisma.appointmentPayment.findFirst({ where: { appointmentId: r20.id } });
  assert(
    num(r30paymentAfter!.amount) === 1000 && num(r30paymentAfter!.refundedAmount) === 300,
    '30. Original payment row and amount remain visible after a refund'
  );

  // 31. Refund history remains auditable
  const auditActions = await prisma.auditLog.findMany({
    where: { entityType: 'RefundRequest', entityId: rr20.id },
    select: { action: true },
  });
  const actions = auditActions.map((a) => a.action);
  assert(
    actions.includes('REFUND_REQUESTED') && actions.includes('REFUND_APPROVED') && actions.includes('REFUND_COMPLETED'),
    '31. Refund lifecycle is fully auditable'
  );

  console.log(`\n🎉 All ${passCount} / ${testCount} finance tests passed successfully!`);
}

runTests()
  .then(async () => {
    await cleanup();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('\n❌ Finance test run failed:', error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup after failure also failed:', cleanupError);
    }
    process.exit(1);
  });
