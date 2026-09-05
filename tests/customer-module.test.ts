import { prisma } from '../src/libs/prisma';
import { customerService } from '../src/modules/customer/services/customer.service';
import { customerMatchingService } from '../src/modules/customer/services/customer-matching.service';

async function runTests() {
  console.log('🧪 Starting Customer Management Module tests...\n');
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

  const TEST_PHONE_PREFIX = '+25198877';
  await prisma.user.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });

  // ============================================================
  // FIXTURE SETUP
  // ============================================================
  const ownerA = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0001`, status: 'ACTIVE' } });
  const ownerB = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0002`, status: 'ACTIVE' } });
  const managerUser = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0003`, status: 'ACTIVE' } });
  const receptionistUser = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0004`, status: 'ACTIVE' } });
  const outsiderUser = await prisma.user.create({ data: { phone: `${TEST_PHONE_PREFIX}0005`, status: 'ACTIVE' } });

  const bizA = await prisma.business.create({
    data: { name: 'Customer Salon A', slug: `cust-salon-a-${Date.now()}`, owner_id: ownerA.id, status: 'ACTIVE' },
  });
  const bizB = await prisma.business.create({
    data: { name: 'Customer Salon B', slug: `cust-salon-b-${Date.now()}`, owner_id: ownerB.id, status: 'ACTIVE' },
  });

  // Roles for bizA
  const ownerRoleA = await prisma.role.create({ data: { businessId: bizA.id, name: 'Owner A', systemKey: 'OWNER' } });
  const managerRoleA = await prisma.role.create({ data: { businessId: bizA.id, name: 'Manager A', systemKey: 'BRANCH_MANAGER' } });
  const receptionistRoleA = await prisma.role.create({ data: { businessId: bizA.id, name: 'Receptionist A', systemKey: 'RECEPTIONIST' } });

  // Owner A membership
  const memberOwnerA = await prisma.businessMember.create({ data: { businessId: bizA.id, userId: ownerA.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: memberOwnerA.id, roleId: ownerRoleA.id, scopeType: 'BUSINESS' } });

  // Manager membership
  const memberManagerA = await prisma.businessMember.create({ data: { businessId: bizA.id, userId: managerUser.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: memberManagerA.id, roleId: managerRoleA.id, scopeType: 'BUSINESS' } });

  // Receptionist membership
  const memberReceptionistA = await prisma.businessMember.create({ data: { businessId: bizA.id, userId: receptionistUser.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: memberReceptionistA.id, roleId: receptionistRoleA.id, scopeType: 'BUSINESS' } });

  // Owner B membership
  const ownerRoleB = await prisma.role.create({ data: { businessId: bizB.id, name: 'Owner B', systemKey: 'OWNER' } });
  const memberOwnerB = await prisma.businessMember.create({ data: { businessId: bizB.id, userId: ownerB.id, status: 'ACTIVE' } });
  await prisma.userRole.create({ data: { businessMemberId: memberOwnerB.id, roleId: ownerRoleB.id, scopeType: 'BUSINESS' } });

  // ============================================================
  // 1. CUSTOMER CREATION TESTS
  // ============================================================
  console.log('--- 1. CUSTOMER CREATION TESTS ---');

  // Owner creates customer with primary + secondary phones
  const c1 = await customerService.createCustomer(bizA.id, ownerA.id, {
    firstName: 'Hana',
    lastName: 'Tesfaye',
    phones: [
      { phone: '+251911000001', isPrimary: true },
      { phone: '+251911000002', isPrimary: false },
    ],
  });
  assert(c1.status === 'ACTIVE', 'Owner can create ACTIVE customer with phones');
  assert(c1.phones.length === 2, 'Customer created with 2 phones');
  assert(c1.phones.filter((p) => p.isPrimary).length === 1, 'Exactly one primary phone');
  assert(c1.phones.find((p) => p.isPrimary)!.normalizedPhone === '+251911000001', 'Primary phone is correct');

  // Branch Manager creates customer
  const c2 = await customerService.createCustomer(bizA.id, managerUser.id, {
    firstName: 'Sara',
    lastName: 'Kebede',
    phones: [{ phone: '+251911000003', isPrimary: true }],
  });
  assert(c2.status === 'ACTIVE', 'Branch manager can create customer');

  // Receptionist creates customer
  const c3 = await customerService.createCustomer(bizA.id, receptionistUser.id, {
    firstName: 'Mulu',
    lastName: 'Haile',
    phones: [{ phone: '+251911000004', isPrimary: true }],
  });
  assert(c3.status === 'ACTIVE', 'Receptionist can create customer');

  // Outsider cannot create
  await assertThrows(
    () => customerService.createCustomer(bizA.id, outsiderUser.id, { firstName: 'X', lastName: 'Y' }),
    'Non-member cannot create customer'
  );

  // Customer without phone → PENDING_DETAILS
  const c4 = await customerService.createCustomer(bizA.id, ownerA.id, { firstName: 'Pending', lastName: 'Guest' });
  assert(c4.status === 'PENDING_DETAILS', 'Customer without phone is PENDING_DETAILS');
  assert(c4.phones.length === 0, 'Pending customer has no phones');

  // Duplicate phones in same request → rejected
  await assertThrows(
    () => customerService.createCustomer(bizA.id, ownerA.id, {
      firstName: 'Dup',
      lastName: 'Test',
      phones: [
        { phone: '+251911000099', isPrimary: true },
        { phone: '+251911000099', isPrimary: false },
      ],
    }),
    'Duplicate phones in request rejected'
  );

  // Phone already belonging to another customer → rejected
  await assertThrows(
    () => customerService.createCustomer(bizA.id, ownerA.id, {
      firstName: 'Clash',
      lastName: 'Test',
      phones: [{ phone: '+251911000001', isPrimary: true }], // c1's phone
    }),
    'Phone already belonging to another customer in same business rejected'
  );

  // ============================================================
  // 2. BUSINESS ISOLATION TESTS
  // ============================================================
  console.log('\n--- 2. BUSINESS ISOLATION TESTS ---');

  // Create customer in bizB
  const cB = await customerService.createCustomer(bizB.id, ownerB.id, {
    firstName: 'Biz B',
    lastName: 'Customer',
    phones: [{ phone: '+251911000010', isPrimary: true }],
  });

  // Owner A cannot read bizB customer
  await assertThrows(
    () => customerService.getCustomerDetails(bizA.id, cB.id, ownerA.id),
    'Business A cannot read Business B customer'
  );

  // Owner A cannot update bizB customer
  await assertThrows(
    () => customerService.updateCustomer(bizA.id, cB.id, ownerA.id, { firstName: 'Hacked' }),
    'Business A cannot update Business B customer'
  );

  // Owner A cannot archive bizB customer
  await assertThrows(
    () => customerService.archiveCustomer(bizA.id, cB.id, ownerA.id),
    'Business A cannot archive Business B customer'
  );

  // Owner A cannot match bizB customer
  const matchB = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251911000010');
  assert(matchB === null, 'Business A match cannot find Business B phone');

  // Same phone can belong to different businesses
  const cSamePhoneB = await customerService.createCustomer(bizB.id, ownerB.id, {
    firstName: 'Same',
    lastName: 'Phone',
    phones: [{ phone: '+251911000001', isPrimary: true }], // same as c1 in bizA
  });
  assert(cSamePhoneB.id !== c1.id, 'Same phone can be used in different businesses');

  // ============================================================
  // 3. PHONE UNIQUENESS TESTS
  // ============================================================
  console.log('\n--- 3. PHONE UNIQUENESS TESTS ---');

  // Secondary phone must also be unique within business
  await assertThrows(
    () => customerService.createCustomer(bizA.id, ownerA.id, {
      firstName: 'New',
      lastName: 'Customer',
      phones: [{ phone: '+251911000002', isPrimary: true }], // c1's secondary
    }),
    'Secondary phone uniqueness enforced'
  );

  // Phone normalization: 0911000001 should normalize to +251911000001 (Ethiopian)
  // This is already taken by c1, so it should reject
  await assertThrows(
    () => customerService.createCustomer(bizA.id, ownerA.id, {
      firstName: 'Norm',
      lastName: 'Test',
      phones: [{ phone: '0911000001', isPrimary: true }], // local format of +251911000001
    }),
    'Phone normalization prevents duplicate via local format'
  );

  // ============================================================
  // 4. LIST/SEARCH TESTS
  // ============================================================
  console.log('\n--- 4. LIST/SEARCH TESTS ---');

  const listResult = await customerService.getCustomers(bizA.id, ownerA.id, { page: 1, limit: 20 });
  assert(listResult.data.length >= 3, 'Owner can list customers');
  // Pending customer should appear since no status filter (only archived is excluded)
  assert(listResult.data.some((c) => c.status === 'PENDING_DETAILS'), 'PENDING_DETAILS customers in list');
  // bizB customer not in bizA list
  assert(!listResult.data.some((c) => c.id === cB.id), 'Business B customer not in Business A listing');

  // Search by name
  const nameSearch = await customerService.getCustomers(bizA.id, ownerA.id, { q: 'Hana', page: 1, limit: 20 });
  assert(nameSearch.data.some((c) => c.id === c1.id), 'Name search finds customer');

  // Search by phone
  const phoneSearch = await customerService.getCustomers(bizA.id, ownerA.id, { phone: '+251911000003', page: 1, limit: 20 });
  assert(phoneSearch.data.some((c) => c.id === c2.id), 'Phone search finds customer');

  // Archived customers not in default list
  const archivedC = await customerService.archiveCustomer(bizA.id, c4.id, ownerA.id);
  assert(archivedC.status === 'ARCHIVED', 'Customer archived');
  const defaultList = await customerService.getCustomers(bizA.id, ownerA.id, { page: 1, limit: 100 });
  assert(!defaultList.data.some((c) => c.id === c4.id), 'Archived customer not in default list');

  // Explicitly request archived
  const archivedList = await customerService.getCustomers(bizA.id, ownerA.id, { status: 'ARCHIVED', page: 1, limit: 20 });
  assert(archivedList.data.some((c) => c.id === c4.id), 'Archived customer visible when status=ARCHIVED');

  // Pagination
  const page1 = await customerService.getCustomers(bizA.id, ownerA.id, { page: 1, limit: 2 });
  assert(page1.data.length === 2, 'Pagination: page 1 returns 2 items');
  assert(page1.meta.totalPages >= 1, 'Pagination: meta present');

  // ============================================================
  // 5. PRIMARY PHONE TESTS
  // ============================================================
  console.log('\n--- 5. PRIMARY PHONE TESTS ---');

  // Customer has exactly one primary phone
  const cFull = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(cFull.phones.filter((p) => p.isPrimary).length === 1, 'Exactly one primary phone on customer');

  // Set secondary as primary
  const secondPhone = cFull.phones.find((p) => !p.isPrimary)!;
  const prevPrimaryId = cFull.phones.find((p) => p.isPrimary)!.id;
  await customerService.setPrimaryPhone(bizA.id, c1.id, secondPhone.id, ownerA.id);

  const afterPrimary = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(afterPrimary.phones.find((p) => p.id === secondPhone.id)!.isPrimary === true, 'New phone is primary');
  assert(afterPrimary.phones.find((p) => p.id === prevPrimaryId)!.isPrimary === false, 'Old primary is no longer primary');
  assert(afterPrimary.phones.filter((p) => p.isPrimary).length === 1, 'Still exactly one primary after change');

  // ============================================================
  // 6. PHONE ADD / REMOVE TESTS
  // ============================================================
  console.log('\n--- 6. PHONE ADD/REMOVE TESTS ---');

  // Add a third phone
  const thirdPhone = await customerService.addCustomerPhone(bizA.id, c1.id, ownerA.id, {
    phone: '+251911000099',
    isPrimary: false,
  });
  assert(thirdPhone.isPrimary === false, 'Third phone added as non-primary');

  // Cross-business phone add rejected (phone already in bizA)
  await assertThrows(
    () => customerService.addCustomerPhone(bizA.id, c2.id, ownerA.id, { phone: '+251911000001', isPrimary: false }),
    'Adding phone that belongs to another customer in same business rejected'
  );

  // Remove non-primary phone
  await customerService.deleteCustomerPhone(bizA.id, c1.id, thirdPhone.id, ownerA.id);
  const afterRemove = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(!afterRemove.phones.some((p) => p.id === thirdPhone.id), 'Phone deleted');

  // Remove primary phone — other phone gets promoted
  const c1Primary = afterRemove.phones.find((p) => p.isPrimary)!;
  const c1NonPrimary = afterRemove.phones.find((p) => !p.isPrimary)!;
  await customerService.deleteCustomerPhone(bizA.id, c1.id, c1Primary.id, ownerA.id);
  const afterPrimaryRemove = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(afterPrimaryRemove.phones.find((p) => p.id === c1NonPrimary.id)!.isPrimary === true, 'Remaining phone auto-promoted to primary');

  // Remove last phone → customer downgrades to PENDING_DETAILS
  const lastPhoneId = afterPrimaryRemove.phones[0].id;
  await customerService.deleteCustomerPhone(bizA.id, c1.id, lastPhoneId, ownerA.id);
  const afterLastPhoneRemove = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(afterLastPhoneRemove.status === 'PENDING_DETAILS', 'Customer downgrades to PENDING_DETAILS when last phone removed');
  assert(afterLastPhoneRemove.phones.length === 0, 'No phones remain');

  // Add phone to PENDING_DETAILS → upgrades to ACTIVE
  await customerService.addCustomerPhone(bizA.id, c1.id, ownerA.id, { phone: '+251911000098', isPrimary: true });
  const afterReactivate = await customerService.getCustomerDetails(bizA.id, c1.id, ownerA.id);
  assert(afterReactivate.status === 'ACTIVE', 'Adding phone to PENDING_DETAILS customer activates them');

  // ============================================================
  // 7. CUSTOMER MATCHING TESTS
  // ============================================================
  console.log('\n--- 7. CUSTOMER MATCHING TESTS ---');

  // Match by primary phone
  const matchByPrimary = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251911000003');
  assert(matchByPrimary !== null && matchByPrimary.id === c2.id, 'Match by primary phone');

  // Match returns null for unknown phone
  const noMatch = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251900000000');
  assert(noMatch === null, 'No match for unknown phone');

  // Match with normalized format works
  const matchNorm = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251911000004');
  assert(matchNorm !== null && matchNorm.id === c3.id, 'Match works with E.164 normalized format');

  // Archived customer still matchable by phone
  const archivedMatch = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251911000098');
  assert(archivedMatch !== null, 'Archived customer still matched by phone');

  // Business isolation in matching
  const bizAMatchForBizBPhone = await customerMatchingService.matchCustomerByPhone(bizA.id, '+251911000010');
  assert(bizAMatchForBizBPhone === null, 'Match does not cross business boundaries');

  // ============================================================
  // 8. FIND-OR-CREATE TESTS
  // ============================================================
  console.log('\n--- 8. FIND-OR-CREATE TESTS ---');

  // Existing phone returns existing customer
  const foundExisting = await customerMatchingService.findOrCreateCustomer(bizA.id, '+251911000003', {
    firstName: 'NewName',
    lastName: 'ShouldNotChange',
    createdById: ownerA.id,
  });
  assert(foundExisting.id === c2.id, 'Find-or-create returns existing customer for known phone');

  // New phone creates customer
  const newFOC = await customerMatchingService.findOrCreateCustomer(bizA.id, '+251911000097', {
    firstName: 'Tigist',
    lastName: 'Alemu',
    createdById: ownerA.id,
  });
  assert(newFOC.firstName === 'Tigist', 'Find-or-create creates new customer for unknown phone');

  // Calling find-or-create again returns same customer (idempotent)
  const idempotent = await customerMatchingService.findOrCreateCustomer(bizA.id, '+251911000097', {
    firstName: 'Different',
    lastName: 'Name',
    createdById: ownerA.id,
  });
  assert(idempotent.id === newFOC.id, 'Find-or-create is idempotent for same phone');

  // ============================================================
  // 9. CUSTOMER UPDATE TESTS
  // ============================================================
  console.log('\n--- 9. CUSTOMER UPDATE TESTS ---');

  const updatedC3 = await customerService.updateCustomer(bizA.id, c3.id, ownerA.id, { firstName: 'Mulunesh' });
  assert(updatedC3.firstName === 'Mulunesh', 'Customer name updated');

  // Cross-business update rejected
  await assertThrows(
    () => customerService.updateCustomer(bizA.id, cB.id, ownerA.id, { firstName: 'Hack' }),
    'Cross-business update rejected'
  );

  // ============================================================
  // 10. ARCHIVE TESTS
  // ============================================================
  console.log('\n--- 10. ARCHIVE TESTS ---');

  const archiveTarget = await customerService.createCustomer(bizA.id, ownerA.id, {
    firstName: 'Archive',
    lastName: 'Test',
    phones: [{ phone: '+251911000096', isPrimary: true }],
  });

  const archived = await customerService.archiveCustomer(bizA.id, archiveTarget.id, ownerA.id);
  assert(archived.status === 'ARCHIVED', 'Customer archived');

  // Record still exists in DB
  const dbRecord = await prisma.customer.findUnique({ where: { id: archiveTarget.id } });
  assert(dbRecord !== null, 'Archived customer record preserved in database');

  // Archive is idempotent
  const archiveAgain = await customerService.archiveCustomer(bizA.id, archiveTarget.id, ownerA.id);
  assert(archiveAgain.status === 'ARCHIVED', 'Archiving an archived customer is idempotent');

  // ============================================================
  // 11. AUDIT LOG TESTS
  // ============================================================
  console.log('\n--- 11. AUDIT LOG TESTS ---');

  const auditLogs = await prisma.auditLog.findMany({ where: { businessId: bizA.id } });
  const actions = auditLogs.map((l) => l.action);

  assert(actions.includes('CUSTOMER_CREATED'), 'Audit log: CUSTOMER_CREATED');
  assert(actions.includes('CUSTOMER_UPDATED'), 'Audit log: CUSTOMER_UPDATED');
  assert(actions.includes('CUSTOMER_PHONE_ADDED'), 'Audit log: CUSTOMER_PHONE_ADDED');
  assert(actions.includes('CUSTOMER_PHONE_REMOVED'), 'Audit log: CUSTOMER_PHONE_REMOVED');
  assert(actions.includes('CUSTOMER_PRIMARY_PHONE_CHANGED'), 'Audit log: CUSTOMER_PRIMARY_PHONE_CHANGED');
  assert(actions.includes('CUSTOMER_ARCHIVED'), 'Audit log: CUSTOMER_ARCHIVED');

  const creationLog = auditLogs.find((l) => l.action === 'CUSTOMER_CREATED' && l.entityId === c1.id);
  assert(creationLog?.actorId === ownerA.id, 'Audit log records correct actor');

  // ============================================================
  // CLEANUP
  // ============================================================
  await prisma.user.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });

  console.log(`\n🎉 All ${passCount} / ${testCount} tests passed successfully!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n💥 Test suite failed:', err.message);
    process.exit(1);
  });
