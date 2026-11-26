import { runPlatformBootstrap, PLATFORM_BOOTSTRAP_MIGRATION } from '../src/platform/bootstrap.js';

export default {
  version: PLATFORM_BOOTSTRAP_MIGRATION.version,
  name: PLATFORM_BOOTSTRAP_MIGRATION.name,
  description: 'N1 platform bootstrap: permissions, role templates, platform settings, compound indexes',
  async up() {
    const result = await runPlatformBootstrap();
    // Single mode has nothing to bootstrap. Recording it as applied would make a later switch
    // to multi mode skip the bootstrap, so defer: the runner leaves it pending.
    if (result?.skipped) return { deferred: true };
    return undefined;
  },
};