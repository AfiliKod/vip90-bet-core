import { runPlatformBootstrap, PLATFORM_BOOTSTRAP_MIGRATION } from '../src/platform/bootstrap.js';

export default {
  version: PLATFORM_BOOTSTRAP_MIGRATION.version,
  name: PLATFORM_BOOTSTRAP_MIGRATION.name,
  description: 'N1 platform bootstrap: permissions, role templates, platform settings, compound indexes',
  async up() {
    await runPlatformBootstrap();
  },
};