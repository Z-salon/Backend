import { DateTime } from 'luxon';
import { prisma } from '../src/libs/prisma';
import { financeReportService } from '../src/modules/finance/services/finance-report.service';
import { expenseService } from '../src/modules/finance/services/expense.service';
import { expenseCategoryService } from '../src/modules/finance/services/expense-category.service';

/**
 * Finance reporting tests: revenue / collected / refunds / outstanding / expenses,
 * date + branch filtering and authorization.
 * Run: npx ts-node --transpile-only tests/finance-report.test.ts
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
const D1 = '2026-10-15';
const D2 = '2026-10-16';
const TAG = '+finrpt';

function at(date: string, hour: number): Date {
  return DateTime.fromISO(date, { zone: TZ }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toJSDate();
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
  if (businessIds.length === 0) { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); return; }

  const appts = { businessId: { in: businessIds } };
  await prisma.expense.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.expenseCategory.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.refundRequest.deleteMany({ where: { appointment: appts } });
  await prisma.paymentReceipt.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.appointmentPayment.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.appointmentStatusHistory.deleteMany({ where: { appointment: appts } });
  await prisma.appointment.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.serviceBranchAssignment.deleteMany({ where: { service: { businessId: { in: businessIds } } } });
  await prisma.service.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.serviceCategory.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.paymentMethod.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.customerPhone.deleteMany({ where: { customer: { businessId: { in: businessIds } } } });
  await prisma.customer.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.branch.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.userRoleBranch.deleteMany({ where: { userRole: { businessMember: { businessId: { in: businessIds } } } } });
  await prisma.userRole.deleteMany({ where: { businessMember: { businessId: { in: businessIds } } } });
  await prisma.businessMember.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.role.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.auditLog.deleteMany({ where: { businessId: { in: businessIds } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function setup() {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251911200001${TAG}`, status: 'ACTIVE' } });
  const manager = await prisma.user.create({ data: { phone: `+251911200002${TAG}`, status: 'ACTIVE' } });
  const business = await prisma.business.create({
    data: { name: 'Report Salon', slug: `rpt-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE', timezone: TZ },
  });

  const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const managerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Branch Manager', systemKey: 'BRANCH_MANAGER' } });

  const ownerMember = await prisma.businessMember.create({ data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: ownerMember.id, roleId: ownerRole.id, scopeType: 'BUSINESS' } });

  const branch1 = await prisma.branch.create({ data: { businessId: business.id, name: 'B1', timezone: TZ, isActive: true } });
  const branch2 = await prisma.branch.create({ data: { businessId: business.id, name: 'B2', timezone: TZ, isActive: true } });

  const managerMember = await prisma.businessMember.create({ data: { businessId: business.id, userId: manager.id, status: 'ACTIVE' } });
  const managerUserRole = await prisma.userRole.create({
    data: { businessMemberId: managerMember.id, roleId: managerRole.id, scopeType: 'BRANCH' },
  });
  await prisma.userRoleBranch.create({ data: { userRoleId: managerUserRole.id, branchId: branch1.id } });

  const category = await prisma.serviceCategory.create({ data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' } });
  const service = await prisma.service.create({
    data: {
      businessId: business.id, categoryId: category.id, name: 'Trim', durationMinutes: 30, price: 1000,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES', depositPolicyType: 'NONE', status: 'ACTIVE',
    },
  });
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id, firstName: 'Abebe', lastName: 'Kebede', status: 'ACTIVE', createdById: owner.id,
      phones: { create: { businessId: business.id, phone: `+251911222222${TAG}`, normalizedPhone: '+251911222222', isPrimary: true } },
    },
  });
  const paymentMethod = await prisma.paymentMethod.create({
    data: { businessId: business.id, name: 'Cash', type: 'CASH', isActive: true },
  });

  const rent = await expenseCategoryService.createCategory(business.id, owner.id, { name: 'Rent' });
  const utilities = await expenseCategoryService.createCategory(business.id, owner.id, { name: 'Utilities' });

  return { owner, manager, business, branch1, branch2, service, customer, paymentMethod, rent, utilities };
}

type F = Awaited<ReturnType<typeof setup>>;

async function makeAppointment(
  f: F,
  opts: { branchId: string; final: number; completedAt: Date; paid?: number; paidAt?: Date }
) {
  const appt = await prisma.appointment.create({
    data: {
      businessId: f.business.id,
      branchId: opts.branchId,
      customerId: f.customer.id,
      serviceId: f.service.id,
      scheduledStart: opts.completedAt,
      scheduledEnd: opts.completedAt,
      status: 'COMPLETED',
      totalAmount: opts.final,
      finalAgreedAmount: opts.final,
      completedAt: opts.completedAt,
      bookingSource: 'WALK_IN',
      createdById: f.owner.id,
    },
  });

  let paymentId: string | null = null;
  if (opts.paid && opts.paid > 0) {
    const payment = await prisma.appointmentPayment.create({
      data: {
        appointmentId: appt.id, businessId: f.business.id, branchId: opts.branchId,
        paymentMethodId: f.paymentMethod.id, amount: opts.paid, status: 'PAID',
        recordedById: f.owner.id, paidAt: opts.paidAt ?? opts.completedAt,
      },
    });
    paymentId = payment.id;
  }
  return { appt, paymentId };
}

async function runTests() {
  console.log('\n📊 Finance reporting\n');
  const f = await setup();

  // ─── Fixtures ────────────────────────────────────────────────
  // Branch 1: two completed appointments on D1 (final 1000 paid 1000, final 1000 paid 300).
  const a1 = await makeAppointment(f, { branchId: f.branch1.id, final: 1000, completedAt: at(D1, 10), paid: 1000 });
  const a2 = await makeAppointment(f, { branchId: f.branch1.id, final: 1000, completedAt: at(D1, 11), paid: 300 });
  // Branch 2: completed 2000 paid 2000 on D1.
  const a3 = await makeAppointment(f, { branchId: f.branch2.id, final: 2000, completedAt: at(D1, 12), paid: 2000 });
  // Branch 1: completed 400, unpaid, on D2 (outside the D1 range).
  await makeAppointment(f, { branchId: f.branch1.id, final: 400, completedAt: at(D2, 10) });

  // A completed refund of 500 against a3's payment.
  await prisma.refundRequest.create({
    data: {
      appointmentId: a3.appt.id, paymentId: a3.paymentId, requestedAmount: 500, approvedAmount: 500,
      status: 'COMPLETED', completedAt: at(D1, 13), completedById: f.owner.id,
    },
  });
  await prisma.appointmentPayment.update({ where: { id: a3.paymentId! }, data: { refundedAmount: 500, status: 'PARTIALLY_REFUNDED' } });

  // A voided payment must never count as collected. It lives on an unfinalized
  // appointment so it cannot affect revenue or outstanding either.
  const voidAppt = await prisma.appointment.create({
    data: {
      businessId: f.business.id, branchId: f.branch1.id, customerId: f.customer.id, serviceId: f.service.id,
      scheduledStart: at(D1, 14), scheduledEnd: at(D1, 14), status: 'PENDING', totalAmount: 500,
      bookingSource: 'WALK_IN', createdById: f.owner.id,
    },
  });
  const voidPay = await prisma.appointmentPayment.create({
    data: {
      appointmentId: voidAppt.id, businessId: f.business.id, branchId: f.branch1.id,
      paymentMethodId: f.paymentMethod.id, amount: 500, status: 'PAID', recordedById: f.owner.id, paidAt: at(D1, 14),
    },
  });
  await prisma.appointmentPayment.update({ where: { id: voidPay.id }, data: { status: 'VOIDED' } });

  // A pending receipt (no payment created) must not appear as collected.
  await prisma.paymentReceipt.create({
    data: {
      appointmentId: a2.appt.id, customerId: f.customer.id, businessId: f.business.id, branchId: f.branch1.id,
      paymentMethodId: f.paymentMethod.id, expectedAmount: 700, submittedAmount: 700,
      receiptImageUrl: 'https://example.com/r.jpg', status: 'PENDING', submittedAt: at(D1, 11),
    },
  });

  // Expenses: rent 500 fully paid (B1), utilities 300 unpaid (B2), voided 999 (B1).
  const rentExp = await expenseService.createExpense(f.business.id, f.owner.id, {
    branchId: f.branch1.id, categoryId: f.rent.id, amount: 500, amountPaid: 500, expenseDate: at(D1, 9).toISOString(),
  });
  await expenseService.createExpense(f.business.id, f.owner.id, {
    branchId: f.branch2.id, categoryId: f.utilities.id, amount: 300, expenseDate: at(D1, 9).toISOString(),
  });
  const voidExpense = await expenseService.createExpense(f.business.id, f.owner.id, {
    branchId: f.branch1.id, categoryId: f.rent.id, amount: 999, expenseDate: at(D1, 9).toISOString(),
  });
  await expenseService.voidExpense(voidExpense.id, f.business.id, f.owner.id, 'duplicate');

  console.log('\n── Summary ──');
  const summary = await financeReportService.getSummary(f.business.id, f.owner.id, { from: D1, to: D1 });
  const s = summary.summary;
  // Revenue: 1000 + 1000 + 2000 (D1 only; the 400 on D2 is excluded and the voided 500 too).
  assert(num(s.totalRevenue) === 4000, '1. Revenue = finalized completed amounts in range (4000)');
  // Collected: 1000 + 300 + 2000 (voided payment and pending receipt excluded).
  assert(num(s.totalPaymentsCollected) === 3300, '2. Collected = verified payments only (pending/voided excluded)');
  assert(num(s.totalRefunds) === 500, '3. Refunds = completed refund requests only');
  // Outstanding is a current snapshot: a2 owes 700 and the unpaid D2 appointment owes 400.
  assert(num(s.totalOutstanding) === 1100, '4. Outstanding = sum of current customer debt (700 + 400)');
  assert(num(s.totalExpenses) === 800, '5. Expenses = incurred, non-voided (500 + 300)');
  assert(num(s.totalExpensesPaid) === 500 && num(s.totalExpensesUnpaid) === 300, '6. Expenses split paid vs unpaid');
  assert(num(s.netOperatingResult) === 3200, '7. Net operating result = revenue - incurred expenses (4000 - 800)');
  assert(num(s.netCashMovement) === 2300, '8. Net cash movement = (collected - refunds) - expenses paid (3300-500-500)');
  assert(s.appointmentCount === 3, '9. Appointment count counts completed appointments in range');
  assert(s.transactionCount === 3, '10. Transaction count counts verified payments in range');

  console.log('\n── Breakdowns ──');
  const byBranch = summary.breakdowns.byBranch as any[];
  const b1 = byBranch.find((b) => b.branchId === f.branch1.id);
  const b2 = byBranch.find((b) => b.branchId === f.branch2.id);
  assert(num(b1.revenue) === 2000 && num(b2.revenue) === 2000, '11. Revenue breakdown by branch splits correctly');
  assert(num(b1.revenue) - num(b1.expenses) === 1500, '12. Per-branch net operating result is computed');
  const byService = summary.breakdowns.byService as any[];
  assert(byService.length === 1 && num(byService[0].amount) === 4000, '13. Revenue breakdown by service');
  const byMethod = summary.breakdowns.byPaymentMethod as any[];
  assert(byMethod.length === 1 && num(byMethod[0].amount) === 3300, '14. Collection breakdown by payment method');
  const byCategory = summary.breakdowns.byExpenseCategory as any[];
  const rentRow = byCategory.find((c) => c.categoryId === f.rent.id);
  assert(num(rentRow.amount) === 500, '15. Expense breakdown by category excludes voided expenses');
  const byDate = summary.breakdowns.byDate as any[];
  assert(byDate.length === 1 && byDate[0].date === D1 && num(byDate[0].revenue) === 4000, '16. Date breakdown groups by business-timezone day');

  console.log('\n── Date boundaries ──');
  const bothDays = await financeReportService.getSummary(f.business.id, f.owner.id, { from: D1, to: D2 });
  assert(num(bothDays.summary.totalRevenue) === 4400, '17. Wider range includes the next day (4400)');
  const future = await financeReportService.getSummary(f.business.id, f.owner.id, { from: '2026-10-20', to: '2026-10-21' });
  assert(num(future.summary.totalRevenue) === 0 && num(future.summary.totalPaymentsCollected) === 0, '18. Range with no activity returns zeros');
  const lateInDay = await financeReportService.getSummary(f.business.id, f.owner.id, {
    from: DateTime.fromISO(D1, { zone: TZ }).startOf('day').toISO()!,
    to: DateTime.fromISO(D1, { zone: TZ }).endOf('day').toISO()!,
  });
  assert(num(lateInDay.summary.totalRevenue) === 4000, '19. End-of-day boundary still includes late transactions');

  console.log('\n── Revenue / collection reports ──');
  const revenue = await financeReportService.getRevenueReport(f.business.id, f.owner.id, { from: D1, to: D1 });
  assert(num(revenue.totalRevenue) === 4000, '20. Revenue report total');
  const collections = await financeReportService.getCollectionReport(f.business.id, f.owner.id, { from: D1, to: D1 });
  assert(num(collections.totalCollected) === 3300 && num(collections.totalRefunds) === 500, '21. Collection report totals');
  assert(num(collections.netCollected) === 2800, '22. Net collected = collected - completed refunds');

  console.log('\n── Refund / outstanding reports ──');
  const refunds = await financeReportService.getRefundReport(f.business.id, f.owner.id, { from: D1, to: D1 });
  assert(num(refunds.completedRefundAmount) === 500 && refunds.byStatus.COMPLETED.count === 1, '23. Only completed refunds count as cash out');
  assert(refunds.byStatus.PENDING.count === 0 && refunds.byStatus.APPROVED.count === 0, '24. No pending/approved refunds double-counted');
  const outstanding = await financeReportService.getOutstandingReport(f.business.id, f.owner.id, {});
  assert(num(outstanding.totalOutstanding) === 1100, '25. Outstanding report total matches canonical formula');
  assert(outstanding.appointments.length === 2, '26. Outstanding report lists only appointments that owe money');
  assert(outstanding.appointments.every((a: any) => num(a.outstanding) > 0), '27. Outstanding rows never show zero/negative debt');

  console.log('\n── Expense report ──');
  const expenseReport = await financeReportService.getExpenseReport(f.business.id, f.owner.id, { from: D1, to: D1 });
  assert(num(expenseReport.totalExpenses) === 800, '28. Expense report total incurred');
  assert(num(expenseReport.totalExpensesPaid) === 500 && num(expenseReport.totalExpensesUnpaid) === 300, '29. Expense report paid/unpaid split');
  assert(expenseReport.expenseCount === 2, '30. Voided expense excluded from count');

  console.log('\n── Branch authorization ──');
  const ownerB1 = await financeReportService.getSummary(f.business.id, f.owner.id, { from: D1, to: D1, branchId: f.branch1.id });
  assert(num(ownerB1.summary.totalRevenue) === 2000, '31. Owner can filter to a single branch');
  await assertThrows(
    () => financeReportService.getSummary(f.business.id, f.manager.id, { from: D1, to: D1, branchId: f.branch2.id }),
    '32. Branch manager cannot access another branch'
  );
  const managerSummary = await financeReportService.getSummary(f.business.id, f.manager.id, { from: D1, to: D1 });
  assert(num(managerSummary.summary.totalRevenue) === 2000, '33. Branch manager sees only their branch by default');
  assert(num(managerSummary.summary.totalPaymentsCollected) === 1300, '34. Branch manager collections are branch-scoped');
  const managerRefunds = await financeReportService.getRefundReport(f.business.id, f.manager.id, { from: D1, to: D1 });
  assert(num(managerRefunds.completedRefundAmount) === 0, '35. Branch manager refund totals are branch-scoped');
  const managerExpenses = await financeReportService.getExpenseReport(f.business.id, f.manager.id, { from: D1, to: D1 });
  assert(num(managerExpenses.totalExpenses) === 500, '36. Branch manager expense totals are branch-scoped');

  console.log('\n── Expense lifecycle ──');
  const rentAfter = await prisma.expense.findUnique({ where: { id: rentExp.id } });
  assert(rentAfter!.status === 'PAID', '37. Fully paid expense has PAID status');
  const partial = await expenseService.createExpense(f.business.id, f.owner.id, {
    branchId: f.branch1.id, categoryId: f.rent.id, amount: 1000, expenseDate: at(D1, 9).toISOString(),
  });
  await expenseService.recordExpensePayment(partial.id, f.business.id, f.owner.id, { amount: 400 });
  const partialAfter = await prisma.expense.findUnique({ where: { id: partial.id } });
  assert(partialAfter!.status === 'PARTIALLY_PAID' && num(partialAfter!.amountPaid) === 400, '38. Partial payment marks expense PARTIALLY_PAID');
  await assertThrows(
    () => expenseService.recordExpensePayment(partial.id, f.business.id, f.owner.id, { amount: 700 }),
    '39. Overpaying an expense is rejected'
  );
  await assertThrows(
    () => expenseService.createExpense(f.business.id, f.manager.id, {
      branchId: f.branch2.id, categoryId: f.rent.id, amount: 100,
    }),
    '40. Branch manager cannot record an expense for another branch'
  );

  console.log(`\n✅ Finance reporting: ${passCount}/${testCount} checks passed\n`);
  if (passCount !== testCount) {
    process.exitCode = 1;
  }
}

runTests()
  .then(async () => {
    await cleanup();
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
