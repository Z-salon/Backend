"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("../src/libs/prisma");
const service_category_service_1 = require("../src/modules/services/services/service-category.service");
const service_service_1 = require("../src/modules/services/services/service.service");
const service_availability_service_1 = require("../src/modules/services/services/service-availability.service");
const client_1 = require("@prisma/client");
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('🧪 Starting Service Categories and Services Module tests...\n');
        let testCount = 0;
        let passCount = 0;
        function assert(condition, description) {
            testCount++;
            if (condition) {
                console.log(`  ✓ Pass ${testCount}: ${description}`);
                passCount++;
            }
            else {
                console.error(`  ❌ FAIL ${testCount}: ${description}`);
                throw new Error(`Test failed: ${description}`);
            }
        }
        // Cleanup past test data if any
        const testPhonePrefix = '+25191199';
        yield prisma_1.prisma.user.deleteMany({
            where: { phone: { startsWith: testPhonePrefix } },
        });
        // Setup Test Fixtures: User, Businesses, Branches, Roles
        const user = yield prisma_1.prisma.user.create({
            data: {
                phone: `${testPhonePrefix}0001`,
                status: 'ACTIVE',
            },
        });
        const businessA = yield prisma_1.prisma.business.create({
            data: {
                name: 'Salon A',
                slug: `salon-a-${Date.now()}`,
                owner_id: user.id,
                status: 'ACTIVE',
            },
        });
        const businessB = yield prisma_1.prisma.business.create({
            data: {
                name: 'Salon B',
                slug: `salon-b-${Date.now()}`,
                owner_id: user.id,
                status: 'ACTIVE',
            },
        });
        // Roles & Memberships for Business A
        const ownerRoleA = yield prisma_1.prisma.role.create({
            data: {
                businessId: businessA.id,
                name: 'Owner Role',
                systemKey: 'OWNER',
            },
        });
        const memberA = yield prisma_1.prisma.businessMember.create({
            data: {
                businessId: businessA.id,
                userId: user.id,
                status: 'ACTIVE',
            },
        });
        yield prisma_1.prisma.userRole.create({
            data: {
                businessMemberId: memberA.id,
                roleId: ownerRoleA.id,
                scopeType: 'BUSINESS',
            },
        });
        // Roles & Memberships for Business B
        const ownerRoleB = yield prisma_1.prisma.role.create({
            data: {
                businessId: businessB.id,
                name: 'Owner Role',
                systemKey: 'OWNER',
            },
        });
        const memberB = yield prisma_1.prisma.businessMember.create({
            data: {
                businessId: businessB.id,
                userId: user.id,
                status: 'ACTIVE',
            },
        });
        yield prisma_1.prisma.userRole.create({
            data: {
                businessMemberId: memberB.id,
                roleId: ownerRoleB.id,
                scopeType: 'BUSINESS',
            },
        });
        // Branches in Business A
        const branchA1 = yield prisma_1.prisma.branch.create({
            data: {
                businessId: businessA.id,
                name: 'Main Branch A1',
                timezone: 'Africa/Addis_Ababa',
                isActive: true,
            },
        });
        const branchA2 = yield prisma_1.prisma.branch.create({
            data: {
                businessId: businessA.id,
                name: 'Secondary Branch A2',
                timezone: 'Africa/Addis_Ababa',
                isActive: true,
            },
        });
        // Inactive branch in Business A
        const branchA3 = yield prisma_1.prisma.branch.create({
            data: {
                businessId: businessA.id,
                name: 'Inactive Branch A3',
                timezone: 'Africa/Addis_Ababa',
                isActive: false,
            },
        });
        // Branch in Business B
        const branchB1 = yield prisma_1.prisma.branch.create({
            data: {
                businessId: businessB.id,
                name: 'Branch B1',
                timezone: 'Africa/Addis_Ababa',
                isActive: true,
            },
        });
        console.log('--- 1. CATEGORY TESTS ---');
        // Test 1: Create Category
        const catHair = yield service_category_service_1.serviceCategoryService.createCategory(businessA.id, user.id, {
            name: 'Hair',
            description: 'Hair services',
            branchIds: [branchA1.id, branchA2.id],
        });
        assert(catHair !== null && catHair.name === 'Hair', 'Category Hair created successfully');
        assert(catHair.branchAssignments.length === 2, 'Category assigned to 2 branches');
        // Test 2: Cannot create duplicate category name in same Business
        try {
            yield service_category_service_1.serviceCategoryService.createCategory(businessA.id, user.id, {
                name: 'Hair',
                branchIds: [branchA1.id],
            });
            assert(false, 'Should have thrown error for duplicate category name');
        }
        catch (err) {
            assert(err.message.includes('already exists'), 'Duplicate category name in same business rejected');
        }
        // Test 3: Can create same category name in different Business
        const catHairB = yield service_category_service_1.serviceCategoryService.createCategory(businessB.id, user.id, {
            name: 'Hair',
            branchIds: [branchB1.id],
        });
        assert(catHairB.name === 'Hair', 'Same category name allowed in different business');
        // Test 4: Cannot assign category to branch from another business
        try {
            yield service_category_service_1.serviceCategoryService.createCategory(businessA.id, user.id, {
                name: 'Nails',
                branchIds: [branchB1.id],
            });
            assert(false, 'Should have rejected branch from another business');
        }
        catch (err) {
            assert(err.message.includes('do not belong to this business'), 'Cross-business branch assignment rejected');
        }
        // Test 5: Cannot assign inactive branch
        try {
            yield service_category_service_1.serviceCategoryService.createCategory(businessA.id, user.id, {
                name: 'Nails',
                branchIds: [branchA3.id],
            });
            assert(false, 'Should have rejected inactive branch');
        }
        catch (err) {
            assert(err.message.includes('inactive'), 'Inactive branch assignment rejected');
        }
        // Create Nails category assigned only to branchA2
        const catNails = yield service_category_service_1.serviceCategoryService.createCategory(businessA.id, user.id, {
            name: 'Nails',
            branchIds: [branchA2.id],
        });
        assert(catNails !== null, 'Category Nails created for Branch A2 only');
        console.log('\n--- 2. SERVICE VALIDATION TESTS ---');
        // Test 6: Duration <= 0 rejected
        try {
            yield service_service_1.serviceService.createService(businessA.id, user.id, {
                categoryId: catHair.id,
                name: 'Haircut',
                durationMinutes: 0,
                price: 100,
                employeeAssignmentMode: client_1.EmployeeAssignmentMode.ANY_AVAILABLE,
                branchIds: [branchA1.id],
            });
            assert(false, 'Should reject durationMinutes <= 0');
        }
        catch (err) {
            assert(err.message.includes('durationMinutes must be > 0'), 'Duration <= 0 rejected');
        }
        // Test 7: Price < 0 rejected
        try {
            yield service_service_1.serviceService.createService(businessA.id, user.id, {
                categoryId: catHair.id,
                name: 'Haircut',
                durationMinutes: 30,
                price: -50,
                employeeAssignmentMode: client_1.EmployeeAssignmentMode.ANY_AVAILABLE,
                branchIds: [branchA1.id],
            });
            assert(false, 'Should reject price < 0');
        }
        catch (err) {
            assert(err.message.includes('price must be >= 0'), 'Price < 0 rejected');
        }
        // Test 8: Fixed deposit exceeding service price rejected
        try {
            yield service_service_1.serviceService.createService(businessA.id, user.id, {
                categoryId: catHair.id,
                name: 'Haircut',
                durationMinutes: 30,
                price: 100,
                employeeAssignmentMode: client_1.EmployeeAssignmentMode.ANY_AVAILABLE,
                depositPolicyType: client_1.DepositPolicyType.FIXED,
                depositAmount: 150,
                branchIds: [branchA1.id],
            });
            assert(false, 'Should reject fixed deposit > price');
        }
        catch (err) {
            assert(err.message.includes('cannot exceed service price'), 'Fixed deposit exceeding price rejected');
        }
        // Test 9: Percentage deposit > 100 rejected
        try {
            yield service_service_1.serviceService.createService(businessA.id, user.id, {
                categoryId: catHair.id,
                name: 'Haircut',
                durationMinutes: 30,
                price: 100,
                employeeAssignmentMode: client_1.EmployeeAssignmentMode.ANY_AVAILABLE,
                depositPolicyType: client_1.DepositPolicyType.PERCENTAGE,
                depositAmount: 110,
                branchIds: [branchA1.id],
            });
            assert(false, 'Should reject percentage deposit > 100');
        }
        catch (err) {
            assert(err.message.includes('<= 100'), 'Percentage deposit > 100 rejected');
        }
        // Test 10: Service assigned to branch where category is NOT active rejected
        try {
            yield service_service_1.serviceService.createService(businessA.id, user.id, {
                categoryId: catNails.id, // Nails is only active at Branch A2
                name: 'Manicure',
                durationMinutes: 45,
                price: 200,
                employeeAssignmentMode: client_1.EmployeeAssignmentMode.CUSTOMER_CHOOSES,
                branchIds: [branchA1.id], // Branch A1 does NOT have Nails category!
            });
            assert(false, 'Should reject assigning service to branch where category is not active');
        }
        catch (err) {
            assert(err.message.includes('Category is not active at one or more of the selected branches'), 'Service creation rejected when category inactive at branch');
        }
        // Test 11: Valid Service Creation
        const serviceHaircut = yield service_service_1.serviceService.createService(businessA.id, user.id, {
            categoryId: catHair.id,
            name: 'Haircut & Styling',
            description: 'Full haircut service',
            durationMinutes: 45,
            price: 300,
            employeeAssignmentMode: client_1.EmployeeAssignmentMode.CUSTOMER_CHOOSES,
            depositPolicyType: client_1.DepositPolicyType.FIXED,
            depositAmount: 50,
            branchIds: [branchA1.id, branchA2.id],
        });
        assert(serviceHaircut !== null && serviceHaircut.name === 'Haircut & Styling', 'Service Haircut created successfully');
        // Create Manicure for Branch A2 where Nails category is active
        const serviceManicure = yield service_service_1.serviceService.createService(businessA.id, user.id, {
            categoryId: catNails.id,
            name: 'Basic Manicure',
            durationMinutes: 30,
            price: 150,
            employeeAssignmentMode: client_1.EmployeeAssignmentMode.ANY_AVAILABLE,
            branchIds: [branchA2.id],
        });
        assert(serviceManicure !== null && serviceManicure.name === 'Basic Manicure', 'Service Manicure created for Branch A2');
        console.log('\n--- 3. EFFECTIVE AVAILABILITY MATRIX TESTS ---');
        // Test 12: Haircut is available at Branch A1 and Branch A2
        const availA1 = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceHaircut.id, branchA1.id);
        const availA2 = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceHaircut.id, branchA2.id);
        assert(availA1 === true, 'Haircut effectively available at Branch A1');
        assert(availA2 === true, 'Haircut effectively available at Branch A2');
        // Test 13: Manicure is available at Branch A2, NOT available at Branch A1
        const maniA1 = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceManicure.id, branchA1.id);
        const maniA2 = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceManicure.id, branchA2.id);
        assert(maniA1 === false, 'Manicure NOT available at Branch A1 (category not assigned)');
        assert(maniA2 === true, 'Manicure effectively available at Branch A2');
        // Test 14: Deactivating Category Branch Assignment deactivates effective service availability
        yield service_category_service_1.serviceCategoryService.updateCategoryBranchAssignment(catHair.id, branchA1.id, user.id, false);
        const availA1AfterDeactivate = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceHaircut.id, branchA1.id);
        assert(availA1AfterDeactivate === false, 'Haircut NOT available at Branch A1 after Hair category branch assignment deactivated');
        // Reactivate category branch assignment
        yield service_category_service_1.serviceCategoryService.updateCategoryBranchAssignment(catHair.id, branchA1.id, user.id, true);
        const availA1AfterReactivate = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceHaircut.id, branchA1.id);
        assert(availA1AfterReactivate === true, 'Haircut available at Branch A1 after Hair category branch assignment reactivated');
        // Test 15: Deactivating Service Branch Assignment
        yield service_service_1.serviceService.updateServiceBranchAssignment(serviceHaircut.id, branchA1.id, user.id, false);
        const availA1ServiceDeactivated = yield service_availability_service_1.serviceAvailabilityService.isServiceAvailableAtBranch(serviceHaircut.id, branchA1.id);
        assert(availA1ServiceDeactivated === false, 'Haircut NOT available at Branch A1 after service branch assignment deactivated');
        // Reactivate service branch assignment
        yield service_service_1.serviceService.updateServiceBranchAssignment(serviceHaircut.id, branchA1.id, user.id, true);
        console.log('\n--- 4. AUDIT LOGGING VERIFICATION ---');
        const auditLogs = yield prisma_1.prisma.auditLog.findMany({
            where: { businessId: businessA.id },
        });
        const actions = auditLogs.map((l) => l.action);
        assert(actions.includes('SERVICE_CATEGORY_CREATED'), 'Audit log contains SERVICE_CATEGORY_CREATED');
        assert(actions.includes('SERVICE_CREATED'), 'Audit log contains SERVICE_CREATED');
        assert(actions.includes('SERVICE_CATEGORY_BRANCH_DEACTIVATED'), 'Audit log contains SERVICE_CATEGORY_BRANCH_DEACTIVATED');
        assert(actions.includes('SERVICE_BRANCH_DEACTIVATED'), 'Audit log contains SERVICE_BRANCH_DEACTIVATED');
        // Cleanup test data
        yield prisma_1.prisma.user.deleteMany({
            where: { phone: { startsWith: testPhonePrefix } },
        });
        console.log(`\n🎉 All ${passCount} / ${testCount} tests passed successfully!`);
    });
}
runTests()
    .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma_1.prisma.$disconnect();
}));
