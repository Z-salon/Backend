import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  // Member permissions
  { code: 'MEMBER_VIEW', name: 'View Members', module: 'MEMBER', description: 'View business members' },
  { code: 'MEMBER_INVITE', name: 'Invite Members', module: 'MEMBER', description: 'Invite new members to business' },
  { code: 'MEMBER_UPDATE', name: 'Update Members', module: 'MEMBER', description: 'Update member details' },
  { code: 'MEMBER_SUSPEND', name: 'Suspend Members', module: 'MEMBER', description: 'Suspend/activate members' },
  { code: 'MEMBER_REMOVE', name: 'Remove Members', module: 'MEMBER', description: 'Remove members from business' },

  // Role permissions
  { code: 'ROLE_VIEW', name: 'View Roles', module: 'ROLE', description: 'View roles and permissions' },
  { code: 'ROLE_CREATE', name: 'Create Roles', module: 'ROLE', description: 'Create custom roles' },
  { code: 'ROLE_UPDATE', name: 'Update Roles', module: 'ROLE', description: 'Update role details' },
  { code: 'ROLE_DELETE', name: 'Delete Roles', module: 'ROLE', description: 'Delete custom roles' },
  { code: 'ROLE_ASSIGN', name: 'Assign Roles', module: 'ROLE', description: 'Assign roles to members' },

  // Booking permissions
  { code: 'BOOKING_VIEW', name: 'View Bookings', module: 'BOOKING', description: 'View bookings' },
  { code: 'BOOKING_CREATE', name: 'Create Bookings', module: 'BOOKING', description: 'Create new bookings' },
  { code: 'BOOKING_UPDATE', name: 'Update Bookings', module: 'BOOKING', description: 'Update booking details' },
  { code: 'BOOKING_CANCEL', name: 'Cancel Bookings', module: 'BOOKING', description: 'Cancel bookings' },
  { code: 'BOOKING_CHECK_IN', name: 'Check In Bookings', module: 'BOOKING', description: 'Check in customers' },
  { code: 'BOOKING_START', name: 'Start Bookings', module: 'BOOKING', description: 'Start service' },
  { code: 'BOOKING_COMPLETE', name: 'Complete Bookings', module: 'BOOKING', description: 'Complete service' },
  { code: 'BOOKING_MARK_NO_SHOW', name: 'Mark No Show', module: 'BOOKING', description: 'Mark booking as no show' },
  { code: 'BOOKING_MANAGE_WAITLIST', name: 'Manage Waitlist', module: 'BOOKING', description: 'Manage booking waitlist' },

  // Customer permissions
  { code: 'CUSTOMER_VIEW', name: 'View Customers', module: 'CUSTOMER', description: 'View customer profiles' },
  { code: 'CUSTOMER_CREATE', name: 'Create Customers', module: 'CUSTOMER', description: 'Create new customers' },
  { code: 'CUSTOMER_UPDATE', name: 'Update Customers', module: 'CUSTOMER', description: 'Update customer details' },

  // Staff permissions
  { code: 'STAFF_VIEW', name: 'View Staff', module: 'STAFF', description: 'View staff profiles' },
  { code: 'STAFF_CREATE', name: 'Create Staff', module: 'STAFF', description: 'Create new staff members' },
  { code: 'STAFF_UPDATE', name: 'Update Staff', module: 'STAFF', description: 'Update staff details' },
  { code: 'STAFF_DEACTIVATE', name: 'Deactivate Staff', module: 'STAFF', description: 'Deactivate staff members' },
  { code: 'STAFF_MANAGE_SCHEDULE', name: 'Manage Staff Schedule', module: 'STAFF', description: 'Manage staff schedules' },

  // Service permissions
  { code: 'SERVICE_VIEW', name: 'View Services', module: 'SERVICE', description: 'View services' },
  { code: 'SERVICE_CREATE', name: 'Create Services', module: 'SERVICE', description: 'Create new services' },
  { code: 'SERVICE_UPDATE', name: 'Update Services', module: 'SERVICE', description: 'Update service details' },
  { code: 'SERVICE_DEACTIVATE', name: 'Deactivate Services', module: 'SERVICE', description: 'Deactivate services' },

  // Branch permissions
  { code: 'BRANCH_VIEW', name: 'View Branches', module: 'BRANCH', description: 'View branches' },
  { code: 'BRANCH_CREATE', name: 'Create Branches', module: 'BRANCH', description: 'Create new branches' },
  { code: 'BRANCH_UPDATE', name: 'Update Branches', module: 'BRANCH', description: 'Update branch details' },
  { code: 'BRANCH_DEACTIVATE', name: 'Deactivate Branches', module: 'BRANCH', description: 'Deactivate branches' },
  { code: 'BRANCH_MANAGE_SETTINGS', name: 'Manage Branch Settings', module: 'BRANCH', description: 'Manage branch settings' },
  { code: 'BRANCH_MANAGE_HOURS', name: 'Manage Branch Hours', module: 'BRANCH', description: 'Manage branch operating hours' },

  // Finance permissions
  { code: 'FINANCE_VIEW', name: 'View Finance', module: 'FINANCE', description: 'View financial records' },
  { code: 'FINANCE_RECORD_PAYMENT', name: 'Record Payment', module: 'FINANCE', description: 'Record payments' },
  { code: 'FINANCE_RECORD_EXPENSE', name: 'Record Expense', module: 'FINANCE', description: 'Record expenses' },
  { code: 'FINANCE_REFUND', name: 'Process Refunds', module: 'FINANCE', description: 'Process refunds' },
  { code: 'FINANCE_ADJUSTMENT', name: 'Financial Adjustments', module: 'FINANCE', description: 'Make financial adjustments' },
  { code: 'FINANCE_VIEW_REPORTS', name: 'View Financial Reports', module: 'FINANCE', description: 'View financial reports' },

  // Report permissions
  { code: 'REPORT_VIEW', name: 'View Reports', module: 'REPORT', description: 'View reports' },
  { code: 'REPORT_EXPORT', name: 'Export Reports', module: 'REPORT', description: 'Export reports' },

  // Business permissions
  { code: 'BUSINESS_VIEW', name: 'View Business', module: 'BUSINESS', description: 'View business details' },
  { code: 'BUSINESS_UPDATE', name: 'Update Business', module: 'BUSINESS', description: 'Update business details' },
  { code: 'BUSINESS_MANAGE_BRANDING', name: 'Manage Branding', module: 'BUSINESS', description: 'Manage business branding' },
  { code: 'BUSINESS_MANAGE_SETTINGS', name: 'Manage Settings', module: 'BUSINESS', description: 'Manage business settings' },
];

async function main() {
  console.log('🌱 Starting database seed...');

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: permission,
      create: permission,
    });
    console.log(`✅ Permission: ${permission.code}`);
  }

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });