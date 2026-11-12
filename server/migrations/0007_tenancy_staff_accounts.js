/**
 * 0007 - G5 staff separation (spec §6.3): admin Users become StaffAccounts with
 * the identical _id and scoped owner/tenant role assignments. The legacy
 * User.role:'admin' login path stays intact, so single mode keeps working.
 */
import { migrateAdminUsersToStaff, STAFF_MIGRATION_NAME } from '../src/tenancy/staffMigration.js';

export default {
  name: STAFF_MIGRATION_NAME,
  version: '1.3.0',
  description: 'Copy admin Users to StaffAccount with identical _id and scoped role assignments (G5, spec §6.3)',
  async up() {
    const report = await migrateAdminUsersToStaff();
    if (report.errors.length > 0) {
      // Leave the migration unmarked so the next run retries the failed users.
      throw new Error(`G5 staff migration finished with ${report.errors.length} error(s); re-run to retry`);
    }
  },
  async down() {
    // Rollback is the preserved legacy User.role:'admin' path (spec §6.3);
    // staff accounts and assignments are never deleted here.
  },
};