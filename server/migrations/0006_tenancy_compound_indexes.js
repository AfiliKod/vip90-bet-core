import { buildCompoundIndexes, INDEX_MIGRATION_NAME } from '../src/tenancy/indexBuilder.js';

export default {
  name: INDEX_MIGRATION_NAME,
  version: '1.2.0',
  description: 'Create compound tenant indexes online without dropping legacy unique indexes (G4, spec §6.3)',
  async up() {
    await buildCompoundIndexes({ background: true });
  },
};
