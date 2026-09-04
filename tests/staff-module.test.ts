import { prisma } from '../src/libs/prisma';
import { staffService } from '../src/modules/staff/services/staff.service';
import { staffQualificationService } from '../src/modules/staff/services/staff-qualification.service';
import { staffScheduleService } from '../src/modules/staff/services/staff-schedule.service';
import { staffTimeOffService } from '../src/modules/staff/services/staff-time-off.service';
import { staffValidationService } from '../src/modules/staff/services/staff-validation.service';

async function runTests() {
  console.log('🧪 Starting Staff Management Module tests...\n');
  let testCount = 0;
  let passCount = 0;

  function assert(condition: boolean, description: string) {
    testCount++;
    if (condition) {
      console.log(`  ✓ Pass ${testCount}: ${description}`);
      passCount++;
    } else {
      console.error(`  ❌ FAIL ${testCount}: ${description}`);
      throw new Error(`Test failed: ${description}`);
    }
  }

  async function assertThrows(fn: () => Promise<any>, description: string) {
    testCount++;
    try {
      await fn();
      console.error(`  ❌ FAIL ${testCount}: ${description} (expected error, got none)`);
      throw new Error(`Test failed: ${description}`);
    } catch (e: any) {
      if (e.message.startsWith('Test failed:')) throw e;
      console.log(`  ✓ Pass ${testCount}: ${description}`);
      passCount++;
    }
  }

  const TEST_PHONE_PREFIX = '+25199887';
  await prisma.user.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });

  // === FIXTURE SETUP ===
  const owner = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0001`, status: 'ACTIVE' } });
  const managerUser = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0002`, status: 'ACTIVE' } });
  const outsiderUser = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0003`, status: 'ACTIVE' } });

  const bizA = await prisma.business.create({
    data: { name: 'Staff Salon A', slug: `staff-salon-a-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE' },
  });
  const bizB = await prisma.business.create({
    data: { name: 'Staff Salon B', slug: `staff-salon-b-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE' },
  });

  const branchA1 = await prisma.branch.create({
    data: { businessId: bizA.id, name: 'Branch A1', timezone: 'Africa/Addis_Ababa', isActive: true },
  });
  const branchA2 = await prisma.branch.create({
    data: { businessId: bizA.id, name: 'Branch A2', timezone: 'Africa/Addis_Ababa', isActive: true },
  });
  const inactiveBranch = await prisma.branch.create({
    data: { businessId: bizA.id, name: 'Inactive Branch', timezone: 'Africa/Addis_Ababa', isActive: false },
  });
  const branchB1 = await prisma.branch.create({
    data: { businessId: bizB.id, name: 'Branch B1', timezone: 'Africa/Addis_Ababa', isActive: true },
  });

  // Roles for bizA
  const ownerRoleA = await prisma.role.create({ data: { businessId: bizA.id, name: 'Owner A', systemKey: 'OWNER' } });
  const managerRoleA = await prisma.role.create({ data: { businessId: bizA.id, name: 'Manager A', systemKey: 'BRANCH_MANAGER' } });
  const ownerRoleB = await prisma.role.create({ data: { businessId: bizB.id, name: 'Owner B', systemKey: 'OWNER' } });

  // Owner membership in bizA
  const memberOwnerA = await prisma.businessMember.create({
    data: { businessId: bizA.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({
    data: { businessMemberId: memberOwnerA.id, roleId: ownerRoleA.id, scopeType: 'BUSINESS' },
  });

  // Manager membership in bizA, scoped to branchA1 only
  const memberManagerA = await prisma.businessMember.create({
    data: { businessId: bizA.id, userId: managerUser.id, status: 'ACTIVE' },
  });
  const managerUserRole = await prisma.userRole.create({
    data: { businessMemberId: memberManagerA.id, roleId: managerRoleA.id, scopeType: 'BRANCH' },
  });
  await prisma.userRoleBranch.create({ data: { userRoleId: managerUserRole.id, branchId: branchA1.id } });

  // Owner membership in bizB
  const memberOwnerB = await prisma.businessMember.create({
    data: { businessId: bizB.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({
    data: { businessMemberId: memberOwnerB.id, roleId: ownerRoleB.id, scopeType: 'BUSINESS' },
  });

  // Service Category + Service in bizA for qualification tests
  const catHair = await prisma.serviceCategory.create({
    data: { businessId: bizA.id, name: 'Hair', status: 'ACTIVE' },
  });
  await prisma.serviceCategoryBranchAssignment.create({
    data: { categoryId: catHair.id, branchId: branchA1.id, isActive: true },
  });

  const svcHaircut = await prisma.service.create({
    data: {
      businessId: bizA.id,
      categoryId: catHair.id,
      name: 'Haircut',
      durationMinutes: 30,
      price: 200,
      employeeAssignmentMode: 'CUSTOMER_CHOOSES',
      status: 'ACTIVE',
    },
  });
  await prisma.serviceBranchAssignment.create({
    data: { serviceId: svcHaircut.id, branchId: branchA1.id, isActive: true },
  });

  // === SECTION 1: STAFF CREATION TESTS ===
  console.log('--- 1. STAFF CREATION TESTS ---');

  const staff1 = await staffService.createStaff(bizA.id, owner.id, {
    branchId: branchA1.id,
    firstName: 'Hana',
    lastName: 'Tesfaye',
    phone: '+251912345678',
  });
  assert(staff1.id !== undefined && staff1.firstName === 'Hana', 'Owner can create staff');
  assert(staff1.businessId === bizA.id, 'Staff belongs to correct business');
  assert(staff1.branchId === branchA1.id, 'Staff belongs to correct branch');
  assert(staff1.status === 'ACTIVE', 'Staff created as ACTIVE');

  await assertThrows(
    () => staffService.createStaff(bizA.id, owner.id, { branchId: inactiveBranch.id, firstName: 'X', lastName: 'Y' }),
    'Inactive branch rejected on staff creation'
  );

  await assertThrows(
    () => staffService.createStaff(bizA.id, owner.id, { branchId: branchB1.id, firstName: 'X', lastName: 'Y' }),
    'Cross-business branch rejected on staff creation'
  );

  await assertThrows(
    () => staffService.createStaff(bizA.id, outsiderUser.id, { branchId: branchA1.id, firstName: 'X', lastName: 'Y' }),
    'Non-member cannot create staff'
  );

  // Create a second staff in branchA2 for isolation tests
  const staff2 = await staffService.createStaff(bizA.id, owner.id, {
    branchId: branchA2.id,
    firstName: 'Sara',
    lastName: 'Kebede',
  });
  assert(staff2.branchId === branchA2.id, 'Staff can be created in second branch');

  // === SECTION 2: BUSINESS ISOLATION TESTS ===
  console.log('\n--- 2. BUSINESS ISOLATION TESTS ---');

  const staffB = await staffService.createStaff(bizB.id, owner.id, {
    branchId: branchB1.id,
    firstName: 'Biz B',
    lastName: 'Staff',
  });

  await assertThrows(
    () => staffService.getStaffDetails(bizA.id, staffB.id, owner.id),
    'Business A owner cannot access staff from Business B'
  );

  await assertThrows(
    () => staffService.updateStaff(bizA.id, staffB.id, owner.id, { firstName: 'Hacked' }),
    'Business A owner cannot update staff from Business B'
  );

  // === SECTION 3: BRANCH MANAGER SCOPE TESTS ===
  console.log('\n--- 3. BRANCH MANAGER SCOPE TESTS ---');

  const staffDetails = await staffService.getStaffDetails(bizA.id, staff1.id, managerUser.id);
  assert(staffDetails.id === staff1.id, 'Manager can access staff in authorized branch');

  await assertThrows(
    () => staffService.getStaffDetails(bizA.id, staff2.id, managerUser.id),
    'Manager cannot access staff in unauthorized branch'
  );

  const bizAStaffList = await staffService.getBusinessStaff(bizA.id, managerUser.id);
  assert(bizAStaffList.length === 1 && bizAStaffList[0].id === staff1.id, 'Manager list scoped to authorized branch only');

  // === SECTION 4: STAFF STATUS TESTS ===
  console.log('\n--- 4. STAFF STATUS TESTS ---');

  const deactivated = await staffService.updateStaff(bizA.id, staff1.id, owner.id, { status: 'INACTIVE' });
  assert(deactivated.status === 'INACTIVE', 'Staff can be deactivated');

  const staffRecord = await prisma.staff.findUnique({ where: { id: staff1.id } });
  assert(staffRecord !== null, 'Deactivated staff record still exists (no hard delete)');

  const reactivated = await staffService.updateStaff(bizA.id, staff1.id, owner.id, { status: 'ACTIVE' });
  assert(reactivated.status === 'ACTIVE', 'Staff can be reactivated');

  // === SECTION 5: BRANCH MOVE TESTS ===
  console.log('\n--- 5. BRANCH MOVE TESTS ---');

  const moved = await staffService.moveStaffBranch(bizA.id, staff1.id, owner.id, branchA2.id);
  assert(moved.branchId === branchA2.id, 'Owner can move staff to another branch');

  await assertThrows(
    () => staffService.moveStaffBranch(bizA.id, staff1.id, managerUser.id, branchA1.id),
    'Branch manager cannot move staff'
  );

  await assertThrows(
    () => staffService.moveStaffBranch(bizA.id, staff1.id, owner.id, branchB1.id),
    'Staff cannot be moved to branch in another business'
  );

  await assertThrows(
    () => staffService.moveStaffBranch(bizA.id, staff1.id, owner.id, inactiveBranch.id),
    'Staff cannot be moved to inactive branch'
  );

  // Move staff1 back to A1 for qualification tests
  await staffService.moveStaffBranch(bizA.id, staff1.id, owner.id, branchA1.id);

  // === SECTION 6: CATEGORY QUALIFICATION TESTS ===
  console.log('\n--- 6. CATEGORY QUALIFICATION TESTS ---');

  const catQual = await staffQualificationService.addCategoryQualification(bizA.id, staff1.id, owner.id, catHair.id);
  assert(catQual !== undefined && catQual.isActive === true, 'Category qualification added successfully');

  // Duplicate rejected
  await assertThrows(
    () => staffQualificationService.addCategoryQualification(bizA.id, staff1.id, owner.id, catHair.id),
    'Duplicate active category qualification rejected'
  );

  // Category from bizB
  const catB = await prisma.serviceCategory.create({ data: { businessId: bizB.id, name: 'Nails B', status: 'ACTIVE' } });
  await assertThrows(
    () => staffQualificationService.addCategoryQualification(bizA.id, staff1.id, owner.id, catB.id),
    'Category from another business rejected for qualification'
  );

  // Category not assigned to staff's branch
  const catHairB1Only = await prisma.serviceCategory.create({ data: { businessId: bizA.id, name: 'Nails A', status: 'ACTIVE' } });
  await prisma.serviceCategoryBranchAssignment.create({ data: { categoryId: catHairB1Only.id, branchId: branchA2.id, isActive: true } });
  await assertThrows(
    () => staffQualificationService.addCategoryQualification(bizA.id, staff1.id, owner.id, catHairB1Only.id),
    'Category not available at staff branch rejected'
  );

  // Remove qualification (soft)
  await staffQualificationService.removeCategoryQualification(bizA.id, staff1.id, owner.id, catHair.id);
  const removedQual = await prisma.staffCategoryQualification.findUnique({
    where: { staffId_categoryId: { staffId: staff1.id, categoryId: catHair.id } },
  });
  assert(removedQual !== null && removedQual.isActive === false, 'Category qualification soft-removed');

  // Re-add after removal (should succeed)
  const readded = await staffQualificationService.addCategoryQualification(bizA.id, staff1.id, owner.id, catHair.id);
  assert(readded.isActive === true, 'Category qualification can be re-added after removal');

  // === SECTION 7: SERVICE QUALIFICATION TESTS ===
  console.log('\n--- 7. SERVICE QUALIFICATION TESTS ---');

  const svcQual = await staffQualificationService.addServiceQualification(bizA.id, staff1.id, owner.id, svcHaircut.id, 'SENIOR');
  assert(svcQual !== undefined && svcQual.isActive === true, 'Service qualification added successfully');
  assert(svcQual.proficiencyLevel === 'SENIOR', 'Proficiency level recorded correctly');

  await assertThrows(
    () => staffQualificationService.addServiceQualification(bizA.id, staff1.id, owner.id, svcHaircut.id, 'SENIOR'),
    'Duplicate active service qualification rejected'
  );

  // Service from bizB
  const svcB = await prisma.service.create({
    data: {
      businessId: bizB.id,
      categoryId: catB.id,
      name: 'Biz B Haircut',
      durationMinutes: 30,
      price: 100,
      employeeAssignmentMode: 'SALON_ASSIGNS',
      status: 'ACTIVE',
    },
  });
  await assertThrows(
    () => staffQualificationService.addServiceQualification(bizA.id, staff1.id, owner.id, svcB.id, 'JUNIOR'),
    'Service from another business rejected for qualification'
  );

  // Remove service qualification
  await staffQualificationService.removeServiceQualification(bizA.id, staff1.id, owner.id, svcHaircut.id);
  const removedSvcQual = await prisma.staffServiceQualification.findUnique({
    where: { staffId_serviceId: { staffId: staff1.id, serviceId: svcHaircut.id } },
  });
  assert(removedSvcQual !== null && removedSvcQual.isActive === false, 'Service qualification soft-removed');

  // === SECTION 8: WEEKLY SCHEDULE TESTS ===
  console.log('\n--- 8. WEEKLY SCHEDULE TESTS ---');

  // Get weekly hours - all should be unconfigured (branch fallback)
  const weeklyHours = await staffScheduleService.getWeeklyHours(bizA.id, staff1.id, owner.id);
  assert(weeklyHours.length === 7, 'Weekly hours response has 7 days');
  assert(weeklyHours.every(d => !d.configured), 'No configured days initially (all fallback to branch)');

  // Configure Monday (day 1) as working
  const monday = await staffScheduleService.updateWeeklyHours(bizA.id, staff1.id, owner.id, 1, true, [
    { start: '09:00', end: '13:00' },
    { start: '14:00', end: '18:00' },
  ]);
  assert(monday !== null && monday!.isWorking === true, 'Working day configured successfully');

  // Configure Sunday (day 0) as explicitly OFF
  const sunday = await staffScheduleService.updateWeeklyHours(bizA.id, staff1.id, owner.id, 0, false, []);
  assert(sunday !== null && sunday!.isWorking === false, 'OFF day configured successfully');

  // Verify configured vs unconfigured distinction
  const updatedHours = await staffScheduleService.getWeeklyHours(bizA.id, staff1.id, owner.id);
  const mondayConfig = updatedHours.find(d => d.day === 1);
  const tuesdayConfig = updatedHours.find(d => d.day === 2);
  const sundayConfig = updatedHours.find(d => d.day === 0);
  assert(mondayConfig?.configured === true && mondayConfig.isWorking === true, 'Monday shows as configured working day');
  assert(tuesdayConfig?.configured === false, 'Tuesday shows as NOT configured (branch fallback)');
  assert(sundayConfig?.configured === true && sundayConfig.isWorking === false, 'Sunday shows as configured OFF day');
  assert((mondayConfig as any).intervals?.length === 2, 'Monday has 2 working intervals');

  // === SECTION 9: WEEKLY BREAK TESTS ===
  console.log('\n--- 9. WEEKLY BREAK TESTS ---');

  const lunchBreak = await staffScheduleService.createWeeklyBreak(bizA.id, staff1.id, owner.id, 1, '13:00', '14:00');
  assert(lunchBreak !== undefined && lunchBreak.dayOfWeek === 1, 'Weekly break created successfully');

  const updatedBreak = await staffScheduleService.updateWeeklyBreak(bizA.id, staff1.id, owner.id, lunchBreak.id, '12:30', '13:30');
  assert(updatedBreak !== null && updatedBreak!.start === '12:30', 'Weekly break updated successfully');

  await staffScheduleService.deleteWeeklyBreak(bizA.id, staff1.id, owner.id, lunchBreak.id);
  const deletedBreak = await prisma.staffWeeklyBreak.findFirst({ where: { id: lunchBreak.id } });
  assert(deletedBreak === null, 'Weekly break deleted');

  // === SECTION 10: SCHEDULE OVERRIDE TESTS ===
  console.log('\n--- 10. SCHEDULE OVERRIDE TESTS ---');

  // OFF override
  await staffScheduleService.updateScheduleOverride(bizA.id, staff1.id, owner.id, '2026-12-25', false, []);
  const overrides = await staffScheduleService.getScheduleOverrides(bizA.id, staff1.id, owner.id);
  assert(overrides.length === 1 && !overrides[0].isWorking, 'Schedule override: OFF day created');

  // Custom hours override
  await staffScheduleService.updateScheduleOverride(bizA.id, staff1.id, owner.id, '2026-12-26', true, [
    { start: '12:00', end: '18:00' },
  ]);
  const allOverrides = await staffScheduleService.getScheduleOverrides(bizA.id, staff1.id, owner.id);
  assert(allOverrides.length === 2, 'Two schedule overrides exist');
  const customDay = allOverrides.find(o => o.date === '2026-12-26');
  assert(customDay?.isWorking === true && customDay.intervals.length === 1, 'Custom hours override created');

  // Delete override
  await staffScheduleService.deleteScheduleOverride(bizA.id, staff1.id, owner.id, '2026-12-25');
  const afterDelete = await staffScheduleService.getScheduleOverrides(bizA.id, staff1.id, owner.id);
  assert(afterDelete.length === 1, 'Schedule override deleted, one remaining');

  // === SECTION 11: BREAK OVERRIDE TESTS ===
  console.log('\n--- 11. BREAK OVERRIDE TESTS ---');

  await staffScheduleService.updateBreakOverride(bizA.id, staff1.id, owner.id, '2026-12-10', [
    { start: '15:00', end: '16:00' },
  ]);
  const breakOverrides = await staffScheduleService.getBreakOverrides(bizA.id, staff1.id, owner.id);
  assert(breakOverrides.length === 1, 'Break override created');

  await staffScheduleService.updateBreakOverride(bizA.id, staff1.id, owner.id, '2026-12-10', []);
  const emptyBreakOverride = await staffScheduleService.getBreakOverrides(bizA.id, staff1.id, owner.id);
  assert(emptyBreakOverride[0].intervals.length === 0, 'Empty break override means no break for that date');

  await staffScheduleService.deleteBreakOverride(bizA.id, staff1.id, owner.id, '2026-12-10');
  const afterBreakDelete = await staffScheduleService.getBreakOverrides(bizA.id, staff1.id, owner.id);
  assert(afterBreakDelete.length === 0, 'Break override deleted');

  // === SECTION 12: TIME OFF TESTS ===
  console.log('\n--- 12. TIME OFF TESTS ---');

  const allDayTimeOff = await staffTimeOffService.createTimeOff(bizA.id, staff1.id, owner.id, {
    date: '2026-12-25',
    allDay: true,
    reason: 'Holiday',
  });
  assert(allDayTimeOff.allDay === true && allDayTimeOff.start === null, 'All-day time off created');

  const partialTimeOff = await staffTimeOffService.createTimeOff(bizA.id, staff1.id, owner.id, {
    date: '2026-12-26',
    allDay: false,
    start: '10:00',
    end: '13:00',
    reason: 'Appointment',
  });
  assert(!partialTimeOff.allDay && partialTimeOff.start === '10:00', 'Partial day time off created');

  const timeOffs = await staffTimeOffService.getTimeOffs(bizA.id, staff1.id, owner.id);
  assert(timeOffs.length === 2, 'Both time offs retrieved');

  await staffTimeOffService.updateTimeOff(bizA.id, staff1.id, owner.id, allDayTimeOff.id, { reason: 'National Holiday' });
  const updated = await prisma.staffTimeOff.findUnique({ where: { id: allDayTimeOff.id } });
  assert(updated?.reason === 'National Holiday', 'Time off reason updated');

  await staffTimeOffService.deleteTimeOff(bizA.id, staff1.id, owner.id, partialTimeOff.id);
  const afterTimeOffDelete = await staffTimeOffService.getTimeOffs(bizA.id, staff1.id, owner.id);
  assert(afterTimeOffDelete.length === 1, 'Time off deleted successfully');

  // === SECTION 13: SCHEDULE VALIDATION ENDPOINT TESTS ===
  console.log('\n--- 13. SCHEDULE VALIDATION TESTS ---');

  const validation = await staffValidationService.validateProposedSchedule(bizA.id, staff1.id, owner.id, {
    dayOfWeek: 1,
    isWorking: true,
    intervals: [{ start: '09:00', end: '17:00' }],
  });
  assert(validation.valid === true, 'Schedule validation returns valid for valid schedule');
  assert(Array.isArray(validation.affectedAppointments), 'Validation returns affectedAppointments array');

  // Cross-business validation fails
  await assertThrows(
    () => staffValidationService.validateProposedSchedule(bizA.id, staffB.id, owner.id, {
      isWorking: true,
      intervals: [{ start: '09:00', end: '17:00' }],
    }),
    'Cross-business schedule validation rejected'
  );

  // === SECTION 14: AUDIT LOG TESTS ===
  console.log('\n--- 14. AUDIT LOG TESTS ---');

  const auditLogs = await prisma.auditLog.findMany({ where: { businessId: bizA.id } });
  const actions = auditLogs.map(l => l.action);

  assert(actions.includes('STAFF_CREATED'), 'Audit log contains STAFF_CREATED');
  assert(actions.includes('STAFF_INACTIVE'), 'Audit log contains STAFF_INACTIVE (deactivation)');
  assert(actions.includes('STAFF_ACTIVE'), 'Audit log contains STAFF_ACTIVE (reactivation)');
  assert(actions.includes('STAFF_BRANCH_CHANGED'), 'Audit log contains STAFF_BRANCH_CHANGED');
  assert(actions.includes('STAFF_CATEGORY_QUALIFICATION_ADDED'), 'Audit log contains STAFF_CATEGORY_QUALIFICATION_ADDED');
  assert(actions.includes('STAFF_CATEGORY_QUALIFICATION_REMOVED'), 'Audit log contains STAFF_CATEGORY_QUALIFICATION_REMOVED');
  assert(actions.includes('STAFF_SERVICE_QUALIFICATION_ADDED'), 'Audit log contains STAFF_SERVICE_QUALIFICATION_ADDED');
  assert(actions.includes('STAFF_SERVICE_QUALIFICATION_REMOVED'), 'Audit log contains STAFF_SERVICE_QUALIFICATION_REMOVED');
  assert(actions.includes('STAFF_WEEKLY_SCHEDULE_UPDATED'), 'Audit log contains STAFF_WEEKLY_SCHEDULE_UPDATED');
  assert(actions.includes('STAFF_WEEKLY_BREAK_CREATED'), 'Audit log contains STAFF_WEEKLY_BREAK_CREATED');
  assert(actions.includes('STAFF_SCHEDULE_OVERRIDE_CREATED'), 'Audit log contains STAFF_SCHEDULE_OVERRIDE_CREATED');
  assert(actions.includes('STAFF_BREAK_OVERRIDE_CREATED'), 'Audit log contains STAFF_BREAK_OVERRIDE_CREATED');
  assert(actions.includes('STAFF_TIME_OFF_CREATED'), 'Audit log contains STAFF_TIME_OFF_CREATED');

  // Verify actor recorded
  const creationLog = auditLogs.find(l => l.action === 'STAFF_CREATED' && l.entityId === staff1.id);
  assert(creationLog?.actorId === owner.id, 'Audit log records correct actor for STAFF_CREATED');

  // Cleanup
  await prisma.user.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });

  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed successfully!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Test suite failed:', err.message);
    process.exit(1);
  });
