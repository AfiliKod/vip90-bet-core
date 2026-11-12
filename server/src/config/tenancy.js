/**
 * Tenancy configuration module.
 * Parses and validates TENANCY_MODE, TENANCY_ENFORCEMENT, and DEMO_* flags.
 * 
 * @module server/src/config/tenancy
 */

const ENFORCEMENT_MODES = ['off', 'log', 'enforce'];
const DEMO_FLAG_ENV = {
  bots: 'DEMO_BOTS',
  fakeWinners: 'DEMO_FAKE_WINNERS',
  instantDeposit: 'DEMO_INSTANT_DEPOSIT',
  data: 'DEMO_DATA',
};

// Frozen sets for validation
const TENANCY_MODES = new Set(['single', 'multi']);
const ENFORCEMENT_MODES_SET = new Set(ENFORCEMENT_MODES);

/**
 * Read and parse the tenancy config from environment variables.
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {{ mode: 'single'|'multi', enforcement: 'off'|'log'|'enforce', demoRequested: { bots: boolean, fakeWinners: boolean, instantDeposit: boolean, data: boolean }, errors: string[] }} Parsed config
 */
function readTenancyConfig(env = process.env) {
  const rawMode = (env.TENANCY_MODE || '').trim();
  const rawEnforcement = (env.TENANCY_ENFORCEMENT || '').trim();

  // Parse mode: unset/empty → 'single'; valid values 'single'/'multi'
  let mode;
  if (!rawMode) {
    mode = 'single';
  } else if (TENANCY_MODES.has(rawMode.toLowerCase())) {
    mode = rawMode.toLowerCase();
  } else {
    mode = 'single';
  }

  // Parse enforcement: unset → single: 'off', multi: 'enforce'
  // empty → default per mode; invalid → mode default + error
  let enforcement;
  let enforcementErrors = [];

  if (!rawEnforcement) {
    enforcement = mode === 'single' ? 'off' : 'enforce';
  } else if (ENFORCEMENT_MODES_SET.has(rawEnforcement.toLowerCase())) {
    enforcement = rawEnforcement.toLowerCase();
  } else {
    enforcement = mode === 'single' ? 'off' : 'enforce';
    enforcementErrors.push(
      `TENANCY_ENFORCEMENT must be "off", "log" or "enforce" (got "${rawEnforcement}")`
    );
  }

  // Parse demo flags: only requested when value is 'true' (trimmed, lower-cased)
  // Effective: always all false in multi mode
  const demoValues = {
    bots: String(env.DEMO_BOTS || '').trim().toLowerCase() === 'true',
    fakeWinners: String(env.DEMO_FAKE_WINNERS || '').trim().toLowerCase() === 'true',
    instantDeposit: String(env.DEMO_INSTANT_DEPOSIT || '').trim().toLowerCase() === 'true',
    data: String(env.DEMO_DATA || '').trim().toLowerCase() === 'true',
  };

  const demoRequested = { ...demoValues };
  const demoErrors = [];

  // In multi mode, demo flags are not effective (all false)
  // But we still read the values; the validation will catch them
  // The effective flags are computed separately in demoFlags.js

  return {
    mode,
    enforcement,
    demoRequested,
    errors: [...enforcementErrors, ...demoErrors],
  };
}

/**
 * Get the tenancy mode ('single' or 'multi').
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {'single'|'multi'} The tenancy mode
 */
function getTenancyMode(env = process.env) {
  return readTenancyConfig(env).mode;
}

/**
 * Get the tenancy enforcement mode.
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {'off'|'log'|'enforce'} The enforcement mode
 */
function getTenancyEnforcement(env = process.env) {
  return readTenancyConfig(env).enforcement;
}

/**
 * Validate startup configuration.
 * Returns an array of problem strings. Order: mode error, enforcement error,
 * multi enforcement, demo flags in DEMO_FLAG_ENV order, JWT_STAFF_SECRET, OPERATOR_SECRET_ENCRYPTION_KEY.
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {string[]} Array of problem strings (empty if valid)
 */
function validateTenancyStartup(env = process.env) {
  const problems = [];

  const rawMode = (env.TENANCY_MODE || '').trim();
  const rawEnforcement = (env.TENANCY_ENFORCEMENT || '').trim();

  // Mode validation
  if (!rawMode) {
    // valid, default to single
  } else if (TENANCY_MODES.has(rawMode.toLowerCase())) {
    // valid
  } else {
    problems.push(
      `TENANCY_MODE must be "single" or "multi" (got "${rawMode}")`
    );
  }

  // Enforcement validation
  if (!rawEnforcement) {
    // valid, will be resolved per mode later
  } else if (ENFORCEMENT_MODES_SET.has(rawEnforcement.toLowerCase())) {
    // valid
  } else {
    problems.push(
      `TENANCY_ENFORCEMENT must be "off", "log" or "enforce" (got "${rawEnforcement}")`
    );
  }

  // Multi mode: enforcement must be 'enforce'
  if (rawMode.toLowerCase() === 'multi' && rawEnforcement.toLowerCase() !== 'enforce') {
    // Only add this error if enforcement was explicitly set but not enforce
    // If enforcement was not set at all, the multi-default will be checked
    const explicitEnforcement = rawEnforcement ? rawEnforcement.trim() : null;
    if (explicitEnforcement && explicitEnforcement.toLowerCase() !== 'enforce') {
      problems.push(
        `TENANCY_MODE=multi requires TENANCY_ENFORCEMENT=enforce (got "${explicitEnforcement}")`
      );
    }
  }

  // Demo flags: in multi mode, any demo flag=true is an error
  const demoFlagNames = ['DEMO_BOTS', 'DEMO_FAKE_WINNERS', 'DEMO_INSTANT_DEPOSIT', 'DEMO_DATA'];
  for (const name of demoFlagNames) {
    const value = (env[name] || '').trim();
    if (value.toLowerCase() === 'true' && rawMode.toLowerCase() === 'multi') {
      problems.push(`TENANCY_MODE=multi does not allow ${name}=true`);
    }
  }

  // JWT_STAFF_SECRET: required in multi mode
  if (rawMode.toLowerCase() === 'multi') {
    const jwtSecret = (env.JWT_STAFF_SECRET || '').trim();
    if (!jwtSecret) {
      problems.push('TENANCY_MODE=multi requires JWT_STAFF_SECRET');
    }
  }

  // OPERATOR_SECRET_ENCRYPTION_KEY: required in multi mode
  if (rawMode.toLowerCase() === 'multi') {
    const opKey = (env.OPERATOR_SECRET_ENCRYPTION_KEY || '').trim();
    if (!opKey) {
      problems.push('TENANCY_MODE=multi requires OPERATOR_SECRET_ENCRYPTION_KEY');
    }
  }

  return problems;
}

/**
 * Assert that validateTenancyStartup throws TenancyStartupError when there are problems.
 * If no problems are specified, asserts that it does NOT throw (valid config).
 *
 * @param {object} [env=process.env] - Environment variable object
 * @param {number} [expectedProblemCount] - If set, checks that e.problems.length === expectedProblemCount
 * @throws {TenancyStartupError} If expected problems are found
 * @returns {void}
 */
function assertTenancyStartup(env, expectedProblemCount) {
  const problems = validateTenancyStartup(env);

  if (expectedProblemCount !== undefined) {
    if (problems.length !== expectedProblemCount) {
      const err = new TenancyStartupError(
        `Expected ${expectedProblemCount} problems but got ${problems.length}: ${JSON.stringify(problems)}`
      );
      err.code = 'TENANCY_STARTUP';
      err.problems = problems;
      throw err;
    }
  }

  if (problems.length > 0) {
    const err = new TenancyStartupError(
      `Startup validation failed: ${problems.join(', ')}`
    );
    err.code = 'TENANCY_STARTUP';
    err.problems = problems;
    throw err;
  }
}

// Attach the problems property to the function for test access
assertTenancyStartup.problems = function (env) {
  return validateTenancyStartup(env);
};

// TenancyStartupError class
class TenancyStartupError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TenancyStartupError';
    this.code = 'TENANCY_STARTUP';
    this.problems = options.problems || [];
  }
}

/**
 * Get effective demo flags.
 * In multi mode, all demo flags are always false regardless of env.
 * In single mode, flags are effective when their env var is 'true'.
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {{ bots: boolean, fakeWinners: boolean, instantDeposit: boolean, data: boolean }} Effective demo flags
 */
function getDemoFlags(env = process.env) {
  const mode = readTenancyConfig(env).mode;
  if (mode === 'multi') {
    return { bots: false, fakeWinners: false, instantDeposit: false, data: false };
  }
  // Single mode: check each flag
  return {
    bots: String(env.DEMO_BOTS || '').trim().toLowerCase() === 'true',
    fakeWinners: String(env.DEMO_FAKE_WINNERS || '').trim().toLowerCase() === 'true',
    instantDeposit: String(env.DEMO_INSTANT_DEPOSIT || '').trim().toLowerCase() === 'true',
    data: String(env.DEMO_DATA || '').trim().toLowerCase() === 'true',
  };
}

/**
 * Check if demo bots are enabled (effective, considering mode).
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {boolean} Whether demo bots are enabled
 */
function isDemoBotsEnabled(env = process.env) {
  return getDemoFlags(env).bots;
}

/**
 * Check if demo fake winners are enabled (effective, considering mode).
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {boolean} Whether demo fake winners are enabled
 */
function isDemoFakeWinnersEnabled(env = process.env) {
  return getDemoFlags(env).fakeWinners;
}

/**
 * Check if demo instant deposit is enabled (effective, considering mode).
 *
 * @param {object} [env=process.env] - Environment variable object
 * @returns {boolean} Whether demo instant deposit is enabled
 */
function isDemoDataEnabled(env = process.env) {
  return getDemoFlags(env).data;
}

/**
 * Express middleware that requires a demo flag to be enabled.
 * If the flag is not enabled (or multi mode), returns 404 DEMO_FEATURE_DISABLED.
 * Unknown flag names throw TypeError at creation time.
 *
 * @param {'bots'|'fakeWinners'|'instantDeposit'|'data'} flag - The demo flag name
 * @returns {(req, res, next) => void} Express middleware function
 * @throws {TypeError} When flag name is unknown
 */
function requireDemoFlag(flag) {
  const allowedFlags = ['bots', 'fakeWinners', 'instantDeposit', 'data'];
  if (!allowedFlags.includes(flag)) {
    throw new TypeError(`Unknown demo flag: "${flag}"`);
  }

  const flagEnv = DEMO_FLAG_ENV[flag];
  if (!flagEnv) {
    throw new TypeError(`Unknown demo flag: "${flag}"`);
  }

  const middleware = (req, res, next) => {
    const env = req.app?.locals?.env ?? process.env;
    const mode = String(env.TENANCY_MODE || 'single').toLowerCase();

    // In multi mode, always disable demo features
    if (mode === 'multi') {
      const err = new Error('DEMO_FEATURE_DISABLED');
      err.code = 'DEMO_FEATURE_DISABLED';
      err.status = 404;
      return next(err);
    }

    // In single mode, check the flag using the correct env var name
    const flagValue = String(env[flagEnv] || '').trim().toLowerCase();
    if (flagValue !== 'true') {
      const err = new Error('DEMO_FEATURE_DISABLED');
      err.code = 'DEMO_FEATURE_DISABLED';
      err.status = 404;
      return next(err);
    }

    next();
  };

  middleware.demoFlag = flag;
  return middleware;
}

// Export all public API
export {
  readTenancyConfig,
  getTenancyMode,
  getTenancyEnforcement,
  validateTenancyStartup,
  assertTenancyStartup,
  TenancyStartupError,
  getDemoFlags,
  isDemoBotsEnabled,
  isDemoFakeWinnersEnabled,
  isDemoDataEnabled,
  requireDemoFlag,
  TENANCY_MODES,
  ENFORCEMENT_MODES,
};