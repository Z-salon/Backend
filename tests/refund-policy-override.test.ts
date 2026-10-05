/**
 * Focused verification of the appointment refund-policy override + cancellation flow.
 *
 * Business rule under test:
 *   BranchBookingConfig is the branch default; an appointment may override it;
 *   on cancellation the effective policy is resolved (override -> branch) and the
 *   refund is calculated from the VERIFIED PAID amount.
 *
 * This test is intentionally small and fast (direct DB fixtures, no slot validation)
 * so it can be run repeatedly against the shared database.
 *
 * Run: npx ts-node --transpile-only tests/refund-policy-override.test.ts
 */
import { PrismaClient, Prisma, RefundPolicyType } from '@prisma/client';
import { appointmentService } from '../src/modules/appointment/services/appointment.service';
import { appointmentPaymentService } from '../src/modules/payment/services/appointment-payment.service';
import { refundRequestService } from '../src/modules/payment/services/refund-request.service';
import { calculateRefundOnCancellation } from '../src/modules/payment/services/refund-policy.service';

const prisma = new PrismaClient();

const TAG = '+refpol';
const TZ = 'Africa/Addis_Ababa';

let pass = 0;
let total = 0;

function check(cond: boolean, label: string) {
  total++;
  if (cond) {
    pass++;
    console.log(`  ✓ ${total}. ${label}`);
  } else {
    console.error(`  ✗ FAIL ${total}. ${label}`);
    throw new Error(`Test failed: ${label}`);
  }
}

async function expectThrows(fn: () => Promise<any>, label: string, expectedSubstring?: string) {
  total++;
  try {
    await fn();
    console.error(`  ✗ FAIL ${total}. ${label} — expected an error but none was thrown`);
    throw new Error(`Test failed: ${label}`);
  } catch (e: any) {
    if (e.message?.startsWith('Test failed:')) throw e;
    if (expectedSubstring && !String(e.message).includes(expectedSubstring)) {
      console.error(`  ✗ FAIL ${total}. ${label} — expected "${expectedSubstring}" but got "${e.message}"`);
      throw new Error(`Test failed: ${label}`);
    }
    pass++;
    console.log(`  ✓ ${total}. ${label}`);
  }
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3600_000);
}

async function cleanup() {
  const users = await prisma.user.findMany({ where: { phone: { contains: TAG } }, select: { id: true } });
  if (users.length === 0) return;
  const businesses = await prisma.business.findMany({ where: { owner_id: { in: users.map((u) => u.id) } }, select: { id: true } });
  const ids = businesses.map((b) => b.id);
  if (ids.length === 0) {
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
    return;
  }
  await prisma.$transaction([
    prisma.refundRequest.deleteMany({ where: { appointment: { businessId: { in: ids } } } }),
    prisma.paymentReceipt.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.appointmentPayment.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.appointmentStaff.deleteMany({ where: { appointment: { businessId: { in: ids } } } }),
    prisma.appointmentStatusHistory.deleteMany({ where: { appointment: { businessId: { in: ids } } } }),
    prisma.appointment.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.staffServiceQualification.deleteMany({ where: { staff: { businessId: { in: ids } } } }),
    prisma.staff.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.serviceBranchAssignment.deleteMany({ where: { service: { businessId: { in: ids } } } }),
    prisma.service.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.serviceCategoryBranchAssignment.deleteMany({ where: { category: { businessId: { in: ids } } } }),
    prisma.serviceCategory.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.branchBookingConfig.deleteMany({ where: { branch: { businessId: { in: ids } } } }),
    prisma.paymentMethod.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.customerPhone.deleteMany({ where: { customer: { businessId: { in: ids } } } }),
    prisma.customer.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.branch.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.userRole.deleteMany({ where: { businessMember: { businessId: { in: ids } } } }),
    prisma.businessMember.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.role.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } }),
    prisma.business.deleteMany({ where: { id: { in: ids } } }),
    prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } }),
  ]);
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911900001${TAG}`, status: 'ACTIVE' } });
  const business = await prisma.business.create({
    data: { name: 'Refund Policy Salon', slug: `refpol-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });
  const role = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const member = await prisma.businessMember.create({ data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: member.id, roleId: role.id, scopeType: 'BUSINESS' } });

  const branch = await prisma.branch.create({ data: { businessId: business.id, name: 'Main', timezone: TZ, isActive: true } });
  const config = await prisma.branchBookingConfig.create({
    data: { branchId: branch.id, onlineBookingEnabled: true, walkInEnabled: true, refundPolicyType: 'NO_REFUND', refundPercentage: null, refundDeadlineHours: 24 },
  });

  const category = await prisma.serviceCategory.create({ data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' } });
  const service = await prisma.service.create({
    data: { businessId: business.id, categoryId: category.id, name: 'Trim', durationMinutes: 30, price: 1000, employeeAssignmentMode: 'CUSTOMER_CHOOSES', depositPolicyType: 'NONE', status: 'ACTIVE' },
  });

  const customer = await prisma.customer.create({
    data: { businessId: business.id, firstName: 'Test', lastName: 'Customer', status: 'ACTIVE', createdById: owner.id },
  });

  const paymentMethod = await prisma.paymentMethod.create({ data: { businessId: business.id, name: 'Cash', type: 'CASH', isActive: true } });

  const staff = await prisma.staff.create({ data: { businessId: business.id, branchId: branch.id, firstName: 'Stylist', lastName: 'One', status: 'ACTIVE' } });

  return { owner, business, branch, config, category, service, customer, paymentMethod, staff };
}

type F = Awaited<ReturnType<typeof setup>>;

let startSeq = 0;
async function makeAppt(
  f: F,
  opts: {
    hoursFromNow?: number;
    status?: any;
    refundPolicyType?: RefundPolicyType | null;
    refundPercentage?: number | null;
    refundDeadlineHours?: number | null;
    override?: { type: RefundPolicyType | null; percentage?: number | null; deadline?: number | null };
  } = {}
) {
  startSeq++;
  const start = hoursFromNow(opts.hoursFromNow ?? 48 + startSeq);
  const appt = await prisma.appointment.create({
    data: {
      businessId: f.business.id,
      branchId: f.branch.id,
      customerId: f.customer.id,
      serviceId: f.service.id,
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 30 * 60000),
      status: opts.status ?? 'CONFIRMED',
      totalAmount: new Prisma.Decimal(1000),
      bookingSource: 'WALK_IN',
      createdById: f.owner.id,
      refundPolicyType: opts.refundPolicyType === undefined ? 'NO_REFUND' : opts.refundPolicyType,
      refundPercentage: opts.refundPercentage ?? null,
      refundDeadlineHours: opts.refundDeadlineHours ?? 24,
      refundPolicyTypeOverride: opts.override?.type ?? null,
      refundPercentageOverride: opts.override?.percentage ?? null,
      refundDeadlineHoursOverride: opts.override?.deadline ?? null,
      staff: { create: { staffId: f.staff.id } },
    },
  });
  return appt;
}

async function pay(f: F, appointmentId: string, amount: number) {
  await appointmentPaymentService.createPayment(appointmentId, f.business.id, f.owner.id, {
    paymentMethodId: f.paymentMethod.id,
    amount,
  });
}

async function effectiveRefund(f: F, appointmentId: string, scheduledStart: Date, cancellationTime = new Date()) {
  return calculateRefundOnCancellation(prisma, appointmentId, f.branch.id, cancellationTime, scheduledStart);
}

async function run() {
  console.log('\n🧾 Refund policy override + cancellation verification\n');
  const f = await setup();

  // ── 1. Branch NO_REFUND, no override -> 0 ─────────────────────────
  console.log('── Policy resolution (calculation) ──');
  {
    const a = await makeAppt(f);
    await pay(f, a.id, 500);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 0 && r.policyType === 'NO_REFUND' && !r.isOverridden, 'Branch NO_REFUND / no override -> refund 0');
  }

  // ── 2. Appointment FULL_REFUND override -> full paid ──────────────
  {
    const a = await makeAppt(f, { override: { type: 'FULL_REFUND' } });
    await pay(f, a.id, 500);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 500 && r.isOverridden, 'Appointment FULL_REFUND override -> refund = paid (500)');
  }

  // ── 3. Appointment PARTIAL_REFUND 50% override -> half paid ───────
  {
    const a = await makeAppt(f, { override: { type: 'PARTIAL_REFUND', percentage: 50 } });
    await pay(f, a.id, 500);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 250, 'Appointment PARTIAL_REFUND 50% override -> refund 250');
  }

  // ── 4. Branch PARTIAL_REFUND 50%, no override -> half paid ────────
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'PARTIAL_REFUND', refundPercentage: 50 } });
    const a = await makeAppt(f, { refundPolicyType: 'PARTIAL_REFUND', refundPercentage: 50 });
    await pay(f, a.id, 500);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 250 && !r.isOverridden, 'Branch PARTIAL_REFUND 50% / no override -> refund 250');
  }

  // ── 5. Override beats branch (branch FULL, appointment NO_REFUND) ─
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND' } });
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', override: { type: 'NO_REFUND' } });
    await pay(f, a.id, 500);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 0 && r.isOverridden, 'Appointment NO_REFUND override beats branch FULL_REFUND -> 0');
  }

  // ── 6. Remove override -> branch used again ───────────────────────
  {
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', override: { type: 'NO_REFUND' } });
    await pay(f, a.id, 500);
    const before = await effectiveRefund(f, a.id, a.scheduledStart);
    check(before.refundAmount === 0, 'Override NO_REFUND in place -> 0');
    await appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, {
      refundPolicyTypeOverride: null,
      refundPercentageOverride: null,
    });
    const after = await effectiveRefund(f, a.id, a.scheduledStart);
    check(after.refundAmount === 500 && !after.isOverridden, 'After removing override -> branch FULL_REFUND used (500)');
  }

  // ── 7. No payment -> 0, and cancellation still works ──────────────
  console.log('\n── No payment / partial payment ──');
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND' } });
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND' });
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    check(r.refundAmount === 0 && r.paidAmount === 0, 'No payment -> refund 0');
    const cancelled = await appointmentService.cancelAppointment(f.business.id, f.owner.id, a.id, true);
    check(cancelled.status === 'CANCELLED', 'Cancel with no payment succeeds');
    const rr = await prisma.refundRequest.count({ where: { appointmentId: a.id } });
    check(rr === 0, 'No refund request created when nothing was paid');
  }

  // ── 8. Partial payment: total 1000, paid 300, 50% -> 150 ──────────
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'PARTIAL_REFUND', refundPercentage: 50 } });
    const a = await makeAppt(f, { refundPolicyType: 'PARTIAL_REFUND', refundPercentage: 50 });
    await pay(f, a.id, 300);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    const fin = await appointmentPaymentService.getAppointmentFinancials(a.id, f.business.id);
    check(r.refundAmount === 150, 'Partial: paid 300, 50% -> refund 150');
    check(Number(fin.outstanding) === 0, 'Unfinalized appointment has no outstanding to refund');
  }

  // ── 9. Outstanding must never be refunded ─────────────────────────
  {
    const a = await makeAppt(f, { refundPolicyType: 'PARTIAL_REFUND', refundPercentage: 50 });
    await pay(f, a.id, 300);
    await appointmentService.setFinalAgreedAmount(a.id, f.business.id, f.owner.id, 1000);
    const r = await effectiveRefund(f, a.id, a.scheduledStart);
    const fin = await appointmentPaymentService.getAppointmentFinancials(a.id, f.business.id);
    check(Number(fin.outstanding) === 700, 'Outstanding is 700 (final 1000 - paid 300)');
    check(r.refundAmount === 150, 'Refund is 50% of PAID (150), not of outstanding');
  }

  // ── 10. Refund deadline: exact timestamps ─────────────────────────
  console.log('\n── Refund deadline ──');
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND', refundDeadlineHours: 24 } });
    const now = new Date();

    // 48h ahead -> within deadline -> refundable
    const aBefore = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', refundDeadlineHours: 24, hoursFromNow: 48 });
    await pay(f, aBefore.id, 500);
    const rBefore = await calculateRefundOnCancellation(prisma, aBefore.id, f.branch.id, now, aBefore.scheduledStart);
    check(rBefore.refundAmount === 500 && !rBefore.outsideDeadline, '48h before start (deadline 24h) -> within deadline, refund 500');

    // Exactly 24h ahead -> at deadline -> still within (>=) -> refundable
    const aAt = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', refundDeadlineHours: 24, hoursFromNow: 24 });
    await pay(f, aAt.id, 500);
    const rAt = await calculateRefundOnCancellation(prisma, aAt.id, f.branch.id, now, aAt.scheduledStart);
    check(rAt.refundAmount === 500 && !rAt.outsideDeadline, 'Exactly at 24h deadline -> refund still allowed');

    // 6h ahead -> outside deadline -> 0
    const aAfter = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', refundDeadlineHours: 24, hoursFromNow: 6 });
    await pay(f, aAfter.id, 500);
    const rAfter = await calculateRefundOnCancellation(prisma, aAfter.id, f.branch.id, now, aAfter.scheduledStart);
    check(rAfter.refundAmount === 0 && rAfter.outsideDeadline, '6h before start (deadline 24h) -> outside deadline, refund 0');
  }

  // ── 11. Duplicate cancellation ────────────────────────────────────
  console.log('\n── Duplicate / concurrent cancellation ──');
  {
    await prisma.branchBookingConfig.update({ where: { branchId: f.branch.id }, data: { refundPolicyType: 'FULL_REFUND', refundDeadlineHours: 24 } });
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', hoursFromNow: 72 });
    await pay(f, a.id, 500);
    const first = await appointmentService.cancelAppointment(f.business.id, f.owner.id, a.id, true);
    check(first.status === 'CANCELLED', 'First cancellation succeeds');
    await expectThrows(
      () => appointmentService.cancelAppointment(f.business.id, f.owner.id, a.id, true),
      'Second cancellation is rejected (already cancelled)'
    );
    const refundCount = await prisma.refundRequest.count({ where: { appointmentId: a.id } });
    check(refundCount === 1, 'Exactly one refund request after duplicate cancellation attempts');
  }

  // ── 12. End-to-end: cancellation creates refund request of the right amount ──
  console.log('\n── End-to-end cancellation -> refund request ──');
  {
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND', hoursFromNow: 72, override: { type: 'PARTIAL_REFUND', percentage: 50 } });
    await pay(f, a.id, 400);
    await appointmentService.cancelAppointment(f.business.id, f.owner.id, a.id, true);
    const rr = await prisma.refundRequest.findFirst({ where: { appointmentId: a.id } });
    check(!!rr && Number(rr.requestedAmount) === 200, 'Cancel uses PARTIAL_REFUND 50% override -> refund request 200 of 400 paid');
    const fin = await appointmentPaymentService.getAppointmentFinancials(a.id, f.business.id);
    check(Number(fin.refundReserved) === 200, 'Refunded 200 is reserved against the appointment');
  }

  // ── 13. Invalid override configuration is rejected ────────────────
  console.log('\n── Validation ──');
  {
    const a = await makeAppt(f, { refundPolicyType: 'FULL_REFUND' });
    await expectThrows(
      () => appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, { refundPolicyTypeOverride: 'PARTIAL_REFUND' }),
      'PARTIAL_REFUND override without percentage is rejected'
    );
    await expectThrows(
      () => appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, { refundPolicyTypeOverride: 'PARTIAL_REFUND', refundPercentageOverride: 150 }),
      'PARTIAL_REFUND override with percentage > 100 is rejected'
    );
    await expectThrows(
      () => appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, { refundPolicyTypeOverride: 'PARTIAL_REFUND', refundPercentageOverride: 0 }),
      'PARTIAL_REFUND override with percentage 0 is rejected'
    );
    await expectThrows(
      () => appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, { refundDeadlineHoursOverride: -1 }),
      'Negative refundDeadlineHoursOverride is rejected'
    );
    const ok = await appointmentService.updateAppointment(a.id, f.business.id, f.owner.id, {
      refundPolicyTypeOverride: 'PARTIAL_REFUND',
      refundPercentageOverride: 50,
      refundDeadlineHoursOverride: 12,
    });
    check(ok.refundPolicyTypeOverride === 'PARTIAL_REFUND' && ok.refundPercentageOverride === 50, 'Valid override is accepted and returned');
    await expectThrows(
      () => refundRequestService.createRefundRequest(a.id, f.business.id, f.owner.id, { amount: 10 }),
      'Refund request for a non-cancelled appointment is rejected'
    );
  }

  console.log(`\n🎉 ${pass}/${total} refund-policy verification checks passed\n`);
}

run()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n❌ Verification failed:', err);
    try { await cleanup(); } catch {}
    await prisma.$disconnect();
    process.exit(1);
  });
