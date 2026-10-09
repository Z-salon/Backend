import { prisma } from '../src/libs/prisma';
import { feedbackRequestService } from '../src/modules/feedback/services/feedback-request.service';
import { feedbackCategoryService } from '../src/modules/feedback/services/feedback-category.service';
import { feedbackAdminService } from '../src/modules/feedback/services/feedback-admin.service';
import { generateFeedbackToken, hashFeedbackToken, encryptFeedbackToken, decryptFeedbackToken } from '../src/utils/feedback-token';
import { FeedbackCategoryType, FeedbackExpiryMode } from '@prisma/client';

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

const TAG = '+fbktst';
const BUSINESS_B_SLUG_SUFFIX = '-b';

interface Fixture {
  owner: any;
  admin: any;
  manager: any;
  ownerMember: any;
  business: any;
  businessB: any;
  branch: any;
  service: any;
  customer: any;
  ratingCategory: any;
  textCategory: any;
  booleanCategory: any;
}

let f: Fixture;

async function cleanup() {
  const businesses = await prisma.business.findMany({
    where: { user: { phone: { contains: TAG } } },
    select: { id: true },
  });
  const ids = businesses.map((b) => b.id);

  if (ids.length > 0) {
    await prisma.feedbackResponse.deleteMany({
      where: { feedbackSubmission: { feedbackRequest: { businessId: { in: ids } } } },
    });
    await prisma.feedbackSubmission.deleteMany({
      where: { feedbackRequest: { businessId: { in: ids } } },
    });
    await prisma.feedbackRequest.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.feedbackCategory.deleteMany({ where: { businessId: { in: ids } } });

    // Business cascade removes appointments, customers, services, branches,
    // members, roles and audit logs.
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
  }

  await prisma.user.deleteMany({ where: { phone: { contains: TAG } } });
}

async function mkAppointment(businessId: string, branchId: string, customerId: string, serviceId: string, status: any, completedAt?: Date) {
  return prisma.appointment.create({
    data: {
      businessId,
      branchId,
      customerId,
      serviceId,
      scheduledStart: new Date('2026-10-15T10:00:00.000Z'),
      scheduledEnd: new Date('2026-10-15T11:00:00.000Z'),
      status,
      completedAt: completedAt ?? (status === 'COMPLETED' ? new Date() : null),
      actualEnd: completedAt ?? (status === 'COMPLETED' ? new Date() : null),
      totalAmount: 100,
      bookingSource: 'STAFF',
    },
  });
}

/** Create a PENDING feedback request directly with a known raw token. */
async function makeRequest(appointment: any, overrides: { expiresAt?: Date | null; status?: any } = {}) {
  const rawToken = generateFeedbackToken();
  const request = await prisma.feedbackRequest.create({
    data: {
      businessId: appointment.businessId,
      appointmentId: appointment.id,
      customerId: appointment.customerId,
      tokenHash: hashFeedbackToken(rawToken),
      encryptedToken: encryptFeedbackToken(rawToken),
      sentAt: new Date(),
      expiresAt: overrides.expiresAt !== undefined ? overrides.expiresAt : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: overrides.status ?? 'PENDING',
    },
  });
  return { request, rawToken };
}

async function setup(): Promise<Fixture> {
  await cleanup();

  const owner = await prisma.user.create({ data: { phone: `+251900000001${TAG}`, status: 'ACTIVE' } });
  const admin = await prisma.user.create({ data: { phone: `+251900000002${TAG}`, status: 'ACTIVE' } });
  const manager = await prisma.user.create({ data: { phone: `+251900000003${TAG}`, status: 'ACTIVE' } });

  const business = await prisma.business.create({
    data: { name: 'Feedback Salon', slug: `fbk-test-${Date.now()}`, owner_id: owner.id, status: 'ACTIVE' },
  });
  const businessB = await prisma.business.create({
    data: { name: 'Other Salon', slug: `fbk-test-${Date.now()}${BUSINESS_B_SLUG_SUFFIX}`, owner_id: owner.id, status: 'ACTIVE' },
  });

  const ownerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Owner', systemKey: 'OWNER' } });
  const adminRole = await prisma.role.create({ data: { businessId: business.id, name: 'Admin', systemKey: 'ADMIN' } });
  const managerRole = await prisma.role.create({ data: { businessId: business.id, name: 'Branch Manager', systemKey: 'BRANCH_MANAGER' } });

  const ownerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, status: 'ACTIVE' },
  });
  const adminMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: admin.id, status: 'ACTIVE' },
  });
  const managerMember = await prisma.businessMember.create({
    data: { businessId: business.id, userId: manager.id, status: 'ACTIVE' },
  });

  await prisma.userRole.create({ data: { businessMemberId: ownerMember.id, roleId: ownerRole.id, scopeType: 'BUSINESS' } });
  await prisma.userRole.create({ data: { businessMemberId: adminMember.id, roleId: adminRole.id, scopeType: 'BUSINESS' } });
  await prisma.userRole.create({ data: { businessMemberId: managerMember.id, roleId: managerRole.id, scopeType: 'BUSINESS' } });

  // Owner is also a member of business B so cross-business category tests have a valid actor.
  const ownerRoleB = await prisma.role.create({ data: { businessId: businessB.id, name: 'Owner', systemKey: 'OWNER' } });
  const ownerMemberB = await prisma.businessMember.create({
    data: { businessId: businessB.id, userId: owner.id, status: 'ACTIVE' },
  });
  await prisma.userRole.create({ data: { businessMemberId: ownerMemberB.id, roleId: ownerRoleB.id, scopeType: 'BUSINESS' } });

  const branch = await prisma.branch.create({
    data: { businessId: business.id, name: 'Main', timezone: 'Africa/Addis_Ababa', isActive: true },
  });

  const category = await prisma.serviceCategory.create({
    data: { businessId: business.id, name: 'Hair', status: 'ACTIVE' },
  });
  const service = await prisma.service.create({
    data: {
      businessId: business.id,
      categoryId: category.id,
      name: 'Haircut',
      durationMinutes: 60,
      price: 100,
      employeeAssignmentMode: 'ANY_AVAILABLE',
    },
  });

  const customer = await prisma.customer.create({
    data: { businessId: business.id, firstName: 'Test', lastName: 'Customer', status: 'ACTIVE' },
  });
  await prisma.customerPhone.create({
    data: { businessId: business.id, customerId: customer.id, phone: '+251900000010', normalizedPhone: '+251900000010', isPrimary: true },
  });

  const ratingCategory = await feedbackCategoryService.createCategory(business.id, owner.id, {
    name: 'Service Quality',
    description: 'How satisfied were you?',
    type: 'RATING' as FeedbackCategoryType,
    ratingScaleMin: 1,
    ratingScaleMax: 5,
    sortOrder: 1,
  });
  const textCategory = await feedbackCategoryService.createCategory(business.id, owner.id, {
    name: 'Comments',
    type: 'TEXT' as FeedbackCategoryType,
    sortOrder: 2,
  });
  const booleanCategory = await feedbackCategoryService.createCategory(business.id, owner.id, {
    name: 'Would recommend',
    type: 'BOOLEAN' as FeedbackCategoryType,
    sortOrder: 3,
  });

  return {
    owner,
    admin,
    manager,
    ownerMember,
    business,
    businessB,
    branch,
    service,
    customer,
    ratingCategory,
    textCategory,
    booleanCategory,
  };
}

async function runTests() {
  console.log('\n🧪 Feedback MVP tests\n');
  f = await setup();

  // ============================================================
  // Category validation & lifecycle
  // ============================================================
  console.log('— Categories —');
  assert(f.ratingCategory.rating_scale_min === 1 && f.ratingCategory.rating_scale_max === 5, '1. Creates a valid RATING category');

  await assertThrows(
    () => feedbackCategoryService.createCategory(f.business.id, f.owner.id, { name: 'Service Quality', type: 'RATING', ratingScaleMin: 1, ratingScaleMax: 5 }),
    '2. Duplicate category name within a business is rejected',
    'already exists'
  );

  await assertThrows(
    () => feedbackCategoryService.createCategory(f.business.id, f.owner.id, { name: 'No Scale', type: 'RATING' }),
    '3. RATING without a rating scale is rejected',
    'ratingScaleMin and ratingScaleMax are required'
  );

  await assertThrows(
    () => feedbackCategoryService.createCategory(f.business.id, f.owner.id, { name: 'Bad Scale', type: 'RATING', ratingScaleMin: 5, ratingScaleMax: 5 }),
    '4. RATING with min >= max is rejected',
    'must be less than'
  );

  await assertThrows(
    () => feedbackCategoryService.createCategory(f.business.id, f.owner.id, { name: 'Text With Scale', type: 'TEXT', ratingScaleMin: 1, ratingScaleMax: 5 }),
    '5. TEXT category with a rating scale is rejected',
    'must be null'
  );

  await assertThrows(
    () => feedbackCategoryService.createCategory(f.business.id, f.manager.id, { name: 'Unauthorized', type: 'TEXT' }),
    '6. BRANCH_MANAGER cannot manage categories (403)',
    'Permission'
  );

  // Same name in a DIFFERENT business is allowed.
  const otherCategory = await feedbackCategoryService.createCategory(f.businessB.id, f.owner.id, {
    name: 'Service Quality',
    type: 'RATING',
    ratingScaleMin: 1,
    ratingScaleMax: 5,
  });
  assert(!!otherCategory.id, '7. Same category name in a different business is allowed');

  // Disable a category; historical responses stay valid, new form hides it.
  const disabled = await feedbackCategoryService.updateCategory(f.booleanCategory.id, f.owner.id, { isEnabled: false });
  assert(disabled.is_enabled === false, '8. Category is disabled (not deleted)');

  const listed = await feedbackCategoryService.listCategories(f.business.id, f.owner.id);
  assert(listed.some((c) => c.id === f.booleanCategory.id && c.is_enabled === false), '9. Admin list includes disabled categories');
  await assertThrows(
    () => feedbackCategoryService.updateCategory(f.ratingCategory.id, f.manager.id, { name: 'Nope' }),
    '10. BRANCH_MANAGER cannot update a category (403)',
    'Permission'
  );

  // ============================================================
  // Request generation
  // ============================================================
  console.log('— Requests —');
  const completedApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const generated = await feedbackRequestService.generateFeedbackRequest(completedApt.id, f.owner.id);

  assert(generated.request.status === 'PENDING' && !!generated.rawToken, '11. Completed appointment generates a PENDING request with a raw token');
  assert(generated.request.tokenHash === hashFeedbackToken(generated.rawToken!), '12. Only the token hash is stored (matches the raw token)');
  assert(generated.request.tokenHash !== generated.rawToken, '13. Raw token is NOT stored in plaintext');
  const ttlDays = (generated.request.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert(ttlDays > 6.9 && ttlDays < 7.1, '14. Expiration is set to ~7 days');

  const regenerate = await feedbackRequestService.generateFeedbackRequest(completedApt.id, f.owner.id);
  assert(regenerate.request.id === generated.request.id, '15. Re-generating is idempotent (same request id)');

  const concurrentApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  await Promise.all([
    feedbackRequestService.generateFeedbackRequest(concurrentApt.id, f.owner.id).catch(() => null),
    feedbackRequestService.generateFeedbackRequest(concurrentApt.id, f.owner.id).catch(() => null),
  ]);
  const concurrentCount = await prisma.feedbackRequest.count({ where: { appointmentId: concurrentApt.id } });
  assert(concurrentCount === 1, '16. Concurrent generation creates exactly ONE request (Case A)');

  const inProgressApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'IN_PROGRESS');
  await assertThrows(
    () => feedbackRequestService.generateFeedbackRequest(inProgressApt.id, f.owner.id),
    '17. Non-completed appointment is rejected',
    'completed'
  );

  const disabledBizApt = await mkAppointment(f.businessB.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  await prisma.business.update({ where: { id: f.businessB.id }, data: { feedbackEnabled: false } });
  await assertThrows(
    () => feedbackRequestService.generateFeedbackRequest(disabledBizApt.id, f.owner.id),
    '18. feedback_enabled=false prevents new requests',
    'disabled'
  );
  await prisma.business.update({ where: { id: f.businessB.id }, data: { feedbackEnabled: true } });

  // ============================================================
  // Customer form
  // ============================================================
  console.log('— Customer form —');
  const formApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const formReq = await makeRequest(formApt);
  const form = await feedbackRequestService.getFormByToken(formReq.rawToken);

  assert(form.categories.every((c: any) => c.type !== 'BOOLEAN'), '19. Only enabled categories are returned');
  assert(!('customer' in form) && !('appointment' in form), '20. Form does not expose customer/appointment data');
  assert(form.categories.every((c: any) => !('businessId' in c) && c.business_id === undefined), '21. Form categories do not expose internal business fields');

  await assertThrows(
    () => feedbackRequestService.getFormByToken(generateFeedbackToken()),
    '22. Invalid token is rejected',
    'not found'
  );

  const expiredApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const expiredReq = await makeRequest(expiredApt, { expiresAt: new Date(Date.now() - 1000) });
  await assertThrows(
    () => feedbackRequestService.getFormByToken(expiredReq.rawToken),
    '23. Expired token returns an expired error',
    'expired'
  );
  const expiredRow = await prisma.feedbackRequest.findUnique({ where: { id: expiredReq.request.id } });
  assert(expiredRow?.status === 'EXPIRED', '24. Expired request is marked EXPIRED');

  // ============================================================
  // Submission
  // ============================================================
  console.log('— Submission —');
  const sub1 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r1 = await makeRequest(sub1);
  const result1 = await feedbackRequestService.submitFeedback({
    token: r1.rawToken,
    is_anonymous: false,
    responses: [
      { category_id: f.ratingCategory.id, rating_value: 5 },
      { category_id: f.textCategory.id, text_response: 'Great service!' },
    ],
  });
  assert(!!result1.submission_id, '25. Valid rating + text submission succeeds');
  const r1Row = await prisma.feedbackRequest.findUnique({ where: { id: r1.request.id } });
  assert(r1Row?.status === 'SUBMITTED', '26. Request transitions PENDING -> SUBMITTED');

  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: r1.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 4 }] }),
    '27. Duplicate submission on the same token returns 409',
    'already been submitted'
  );

  const sub2 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r2 = await makeRequest(sub2);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: r2.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 9 }] }),
    '28. Rating outside the configured range is rejected',
    'between'
  );

  const sub3 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r3 = await makeRequest(sub3);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: r3.rawToken, is_anonymous: false, responses: [{ category_id: f.textCategory.id, rating_value: 3 }] }),
    '29. Wrong response type for the category is rejected',
    'text_response is required for TEXT categories'
  );

  const sub4 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r4 = await makeRequest(sub4);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: r4.rawToken, is_anonymous: false, responses: [{ category_id: f.booleanCategory.id, boolean_response: true }] }),
    '30. Disabled category is rejected (Case C)',
    'no longer available'
  );

  const sub5 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r5 = await makeRequest(sub5);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: r5.rawToken, is_anonymous: false, responses: [{ category_id: otherCategory.id, rating_value: 4 }] }),
    '31. Category belonging to another business is rejected (Case E)',
    'Invalid feedback category'
  );

  const sub6 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const r6 = await makeRequest(sub6);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({
      token: r6.rawToken,
      is_anonymous: false,
      responses: [
        { category_id: f.ratingCategory.id, rating_value: 4 },
        { category_id: f.ratingCategory.id, rating_value: 5 },
      ],
    }),
    '32. Duplicate category within one submission is rejected',
    'only be answered once'
  );

  const notCompletedApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'CANCELLED');
  const ncReq = await makeRequest(notCompletedApt);
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: ncReq.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }] }),
    '33. Feedback for a non-completed appointment is rejected',
    'not available'
  );

  const expiredSubApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const expiredSubReq = await makeRequest(expiredSubApt, { expiresAt: new Date(Date.now() - 1000) });
  await assertThrows(
    () => feedbackRequestService.submitFeedback({ token: expiredSubReq.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }] }),
    '34. Submission after expiry is rejected (Case D)',
    'expired'
  );

  const booleanApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const booleanReq = await makeRequest(booleanApt);
  // Re-enable boolean for this assertion.
  await feedbackCategoryService.updateCategory(f.booleanCategory.id, f.owner.id, { isEnabled: true });
  const booleanResult = await feedbackRequestService.submitFeedback({
    token: booleanReq.rawToken,
    is_anonymous: false,
    responses: [{ category_id: f.booleanCategory.id, boolean_response: true }],
  });
  assert(!!booleanResult.submission_id, '35. Valid BOOLEAN submission succeeds');

  // Concurrency: two simultaneous submissions of the same token.
  const concApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const concReq = await makeRequest(concApt);
  const concResults = await Promise.allSettled([
    feedbackRequestService.submitFeedback({ token: concReq.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }] }),
    feedbackRequestService.submitFeedback({ token: concReq.rawToken, is_anonymous: false, responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }] }),
  ]);
  const fulfilled = concResults.filter((r) => r.status === 'fulfilled').length;
  const submissions = await prisma.feedbackSubmission.count({ where: { feedbackRequestId: concReq.request.id } });
  assert(fulfilled === 1 && submissions === 1, '36. Concurrent submission yields ONE submission, one 409 (Case B)');

  // ============================================================
  // Privacy & authorization
  // ============================================================
  console.log('— Privacy & authorization —');

  const anonApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const anonReq = await makeRequest(anonApt);
  const anonResult = await feedbackRequestService.submitFeedback({
    token: anonReq.rawToken,
    is_anonymous: true,
    responses: [{ category_id: f.ratingCategory.id, rating_value: 2 }],
  });

  const anonDetail = await feedbackAdminService.getFeedbackDetail(f.business.id, f.owner.id, anonResult.submission_id);
  assert(anonDetail.is_anonymous === true && anonDetail.customer === null && anonDetail.appointment === null, '37. Anonymous feedback hides customer and appointment (Case F)');
  assert(!JSON.stringify(anonDetail).includes(f.customer.id) && !JSON.stringify(anonDetail).includes('Test'), '38. Anonymous serialization contains no customer identity');

  const idApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const idReq = await makeRequest(idApt);
  const idResult = await feedbackRequestService.submitFeedback({
    token: idReq.rawToken,
    is_anonymous: false,
    responses: [{ category_id: f.ratingCategory.id, rating_value: 4 }],
  });
  const idDetail = await feedbackAdminService.getFeedbackDetail(f.business.id, f.owner.id, idResult.submission_id);
  assert(idDetail.is_anonymous === false && idDetail.customer?.id === f.customer.id, '39. Identified feedback exposes authorized customer context (Case G)');

  const list = await feedbackAdminService.listFeedback(f.business.id, f.owner.id, { page: 1, limit: 50 });
  assert(list.data.length >= 2 && list.meta.total >= 2, '40. OWNER can list feedback');

  const adminList = await feedbackAdminService.listFeedback(f.business.id, f.admin.id, { page: 1, limit: 5 });
  assert(!!adminList.meta, '41. ADMIN can list feedback');

  await assertThrows(
    () => feedbackAdminService.listFeedback(f.business.id, f.manager.id, {}),
    '42. BRANCH_MANAGER cannot access feedback (403) (Case H)',
    'Permission'
  );

  await assertThrows(
    () => feedbackAdminService.listFeedback(f.businessB.id, f.manager.id, {}),
    '43. Non-member cannot access another business feedback (403)',
    'Not a member'
  );

  // Audit trail: FEEDBACK_VIEWED must have been recorded without customer identity.
  const viewAudits = await prisma.auditLog.findMany({
    where: { businessId: f.business.id, action: 'FEEDBACK_VIEWED' },
  });
  assert(viewAudits.length >= 1, '44. FEEDBACK_VIEWED audit events are recorded');
  assert(viewAudits.every((a) => !JSON.stringify(a.newValues ?? {}).includes(f.customer.id)), '45. FEEDBACK_VIEWED audit metadata contains no customer identity');

  const submittedAudits = await prisma.auditLog.count({ where: { businessId: f.business.id, action: 'FEEDBACK_SUBMITTED' } });
  assert(submittedAudits >= 1, '46. FEEDBACK_SUBMITTED audit events are recorded');

  // ============================================================
  // Phase 3 & 6.A: Configurable Expiration & Settings
  // ============================================================
  console.log('— Configurable Expiration & Settings —');

  const settings0 = await feedbackAdminService.getFeedbackSettings(f.business.id, f.owner.id);
  assert(settings0.feedback_expiry_mode === 'DAYS_7', '47. Default expiry mode is DAYS_7');

  const settings15 = await feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
    feedbackExpiryMode: 'DAYS_15',
  });
  assert(settings15.feedback_expiry_mode === 'DAYS_15', '48. Expiry mode updated to DAYS_15');

  const apt15 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const req15 = await feedbackRequestService.generateFeedbackRequest(apt15.id, f.owner.id);
  const ttl15 = (req15.request.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert(ttl15 > 14.8 && ttl15 < 15.2, '49. DAYS_15 mode calculates expiration ~15 days');

  await feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
    feedbackExpiryMode: 'DAYS_30',
  });
  const apt30 = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const req30 = await feedbackRequestService.generateFeedbackRequest(apt30.id, f.owner.id);
  const ttl30 = (req30.request.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert(ttl30 > 29.8 && ttl30 < 30.2, '50. DAYS_30 mode calculates expiration ~30 days');

  await feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
    feedbackExpiryMode: 'CUSTOM',
    feedbackCustomExpiryDays: 12,
  });
  const aptCustom = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const reqCustom = await feedbackRequestService.generateFeedbackRequest(aptCustom.id, f.owner.id);
  const ttlCustom = (reqCustom.request.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert(ttlCustom > 11.8 && ttlCustom < 12.2, '51. CUSTOM mode with 12 days calculates ~12 days');

  await assertThrows(
    () => feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
      feedbackExpiryMode: 'CUSTOM',
      feedbackCustomExpiryDays: 0,
    }),
    '52. Custom expiry < 1 day is rejected',
    'between 1 and 365'
  );

  await assertThrows(
    () => feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
      feedbackExpiryMode: 'CUSTOM',
      feedbackCustomExpiryDays: 400,
    }),
    '53. Custom expiry > 365 days is rejected',
    'between 1 and 365'
  );

  await feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
    feedbackExpiryMode: 'NEVER',
  });
  const aptNever = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const reqNever = await feedbackRequestService.generateFeedbackRequest(aptNever.id, f.owner.id);
  assert(reqNever.request.expiresAt === null, '54. NEVER mode sets expiresAt to null');

  // Changing business setting must NOT retroactively change existing request
  assert(req15.request.expiresAt !== null, '55. Updating business settings does not change existing request expiry');

  // Completion timestamp calculation: 3 days in the past + 7 days mode = ~4 days remaining
  await feedbackAdminService.updateFeedbackSettings(f.business.id, f.owner.id, {
    feedbackExpiryMode: 'DAYS_7',
  });
  const pastCompleted = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const aptPast = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED', pastCompleted);
  const reqPast = await feedbackRequestService.generateFeedbackRequest(aptPast.id, f.owner.id);
  const ttlPast = (reqPast.request.expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  assert(ttlPast > 3.8 && ttlPast < 4.2, '56. Expiration is calculated from appointment completion timestamp');

  // Branch manager cannot update feedback settings
  await assertThrows(
    () => feedbackAdminService.updateFeedbackSettings(f.business.id, f.manager.id, { feedbackEnabled: false }),
    '57. BRANCH_MANAGER cannot update feedback settings (403)',
    'Permission'
  );

  // ============================================================
  // Phase 2.2 & 6.B: Token Encryption, Retrieval & Revocation
  // ============================================================
  console.log('— Link Retrieval, Token Encryption & Revocation —');

  const shareReq = await feedbackRequestService.getAppointmentFeedbackRequest(f.business.id, aptNever.id, f.owner.id);
  assert(shareReq.url !== null && shareReq.url.includes(reqNever.rawToken!), '58. getAppointmentFeedbackRequest recovers original URL');
  assert(shareReq.qr_code_url !== null && shareReq.qr_code_url.includes(encodeURIComponent(shareReq.url!)), '59. Share payload includes valid QR code URL');

  // Re-reading appointment link never changes the token
  const shareReq2 = await feedbackRequestService.getAppointmentFeedbackRequest(f.business.id, aptNever.id, f.owner.id);
  assert(shareReq2.url === shareReq.url, '60. Viewing feedback request does not rotate token');

  // Revocation
  const revokedResult = await feedbackRequestService.revokeFeedbackRequest(f.business.id, aptNever.id, f.owner.id);
  assert(revokedResult.status === 'REVOKED', '61. Revoking appointment request sets status to REVOKED');

  // Re-revoking is idempotent
  const revokedAgain = await feedbackRequestService.revokeFeedbackRequest(f.business.id, aptNever.id, f.owner.id);
  assert(revokedAgain.status === 'REVOKED', '62. Revoking an already revoked request is idempotent');

  // Customer cannot view form or submit on revoked token
  await assertThrows(
    () => feedbackRequestService.getFormByToken(reqNever.rawToken!),
    '63. getFormByToken on revoked link is rejected with 410',
    'revoked'
  );
  await assertThrows(
    () => feedbackRequestService.submitFeedback({
      token: reqNever.rawToken!,
      responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }],
    }),
    '64. submitFeedback on revoked link is rejected with 410',
    'revoked'
  );

  // Cannot revoke already submitted request
  await assertThrows(
    () => feedbackRequestService.revokeFeedbackRequest(f.business.id, sub1.id, f.owner.id),
    '65. Revoking an already submitted request is rejected (409)',
    'already been submitted'
  );

  // ============================================================
  // Phase 4.3: Submission Idempotency
  // ============================================================
  console.log('— Idempotency —');

  const idemApt = await mkAppointment(f.business.id, f.branch.id, f.customer.id, f.service.id, 'COMPLETED');
  const idemReq = await makeRequest(idemApt);
  const idemKey = `idem-test-${Date.now()}`;

  const firstSub = await feedbackRequestService.submitFeedback({
    token: idemReq.rawToken,
    idempotency_key: idemKey,
    is_anonymous: false,
    responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }],
  });
  assert(!!firstSub.submission_id, '66. First submission with idempotency key succeeds');

  // Retry with SAME idempotency key and SAME payload succeeds with same submission_id
  const replaySub = await feedbackRequestService.submitFeedback({
    token: idemReq.rawToken,
    idempotency_key: idemKey,
    is_anonymous: false,
    responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }],
  });
  assert(replaySub.submission_id === firstSub.submission_id, '67. Idempotent retry returns original successful submission');

  // Retry with SAME idempotency key but DIFFERENT payload is rejected
  await assertThrows(
    () => feedbackRequestService.submitFeedback({
      token: idemReq.rawToken,
      idempotency_key: idemKey,
      is_anonymous: false,
      responses: [{ category_id: f.ratingCategory.id, rating_value: 4 }],
    }),
    '68. Idempotency key reused with different payload is rejected',
    'Idempotency key reused'
  );

  // Retry with DIFFERENT key on already submitted request is rejected with 409
  await assertThrows(
    () => feedbackRequestService.submitFeedback({
      token: idemReq.rawToken,
      idempotency_key: 'different-key',
      is_anonymous: false,
      responses: [{ category_id: f.ratingCategory.id, rating_value: 5 }],
    }),
    '69. Different idempotency key on already submitted request returns 409',
    'already been submitted'
  );

  await cleanup();
  console.log(`\n🎉 All ${passCount} / ${testCount} feedback tests passed!\n`);
}

runTests()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\n💥 Feedback test suite failed:', e);
    cleanup().finally(() => process.exit(1));
  });
