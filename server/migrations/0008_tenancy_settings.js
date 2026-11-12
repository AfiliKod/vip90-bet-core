import {
  runSettingsMigration,
  SETTINGS_MIGRATION_NAME,
  SETTINGS_MIGRATION_VERSION,
} from '../src/tenancy/settingsMigration.js';

export default {
  name: SETTINGS_MIGRATION_NAME,
  version: SETTINGS_MIGRATION_VERSION,
  description: 'G6: scope legacy Setting rows (platform/tenant) and build the compound unique index (spec §6.3)',
  async up() {
    await runSettingsMigration({});
  },
};