#!/usr/bin/env node
/**
 * Emergency staff recovery CLI (G5).
 *
 *   node scripts/staff-recover.mjs --list
 *   node scripts/staff-recover.mjs --email <email> --reset-password <newPassword>
 *   node scripts/staff-recover.mjs --email <email> --reset-2fa
 *   node scripts/staff-recover.mjs --email <email> --promote-owner
 *   node scripts/staff-recover.mjs --create-owner --email <email> --username <username> --password <password>
 *
 * Runs directly against the server database from the host terminal, so it needs the
 * same MONGODB_URI the server uses (root .env or server/.env); it never guesses one.
 * Password and 2FA resets bump tokenVersion, which invalidates tokens already issued
 * to that account. Every action is idempotent: re-running reports what was already in
 * place instead of duplicating rows. Exit code 0 on success, 1 on error.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import StaffAccount from '../server/src/models/StaffAccount.js';
import Role from '../server/src/models/Role.js';
import RoleAssignment from '../server/src/models/RoleAssignment.js';
import Tenant from '../server/src/models/Tenant.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// The root package.json carries no runtime dependencies: mongoose and dotenv are installed
// under server/. Resolving from there returns the very mongoose instance the model modules
// use, so the CLI sees (and joins) the connection an importing process already opened.
const requireFromServer = createRequire(join(__dirname, '..', 'server', 'package.json'));
const mongoose = requireFromServer('mongoose');

const OWNER_ROLE_NAMES = { platform: 'platform_owner', tenant: 'tenant_owner' };
const VALUE_FLAGS = new Map([
  ['--email', 'email'],
  ['--reset-password', 'resetPassword'],
  ['--username', 'username'],
  ['--password', 'password'],
]);
const BOOLEAN_FLAGS = new Map([
  ['--list', 'list'],
  ['--reset-2fa', 'reset2fa'],
  ['--promote-owner', 'promoteOwner'],
  ['--create-owner', 'createOwner'],
  ['--help', 'help'],
  ['-h', 'help'],
]);

export function parseArgs(argv = []) {
  const opts = {
    email: null, resetPassword: null, username: null, password: null,
    list: false, reset2fa: false, promoteOwner: false, createOwner: false, help: false,
    missingValue: [], unknown: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (VALUE_FLAGS.has(arg)) {
      const key = VALUE_FLAGS.get(arg);
      const value = argv[++i];
      if (value === undefined) opts.missingValue.push(arg);
      else opts[key] = value;
      continue;
    }
    if (BOOLEAN_FLAGS.has(arg)) {
      opts[BOOLEAN_FLAGS.get(arg)] = true;
      continue;
    }
    opts.unknown.push(arg);
  }

  return opts;
}

function validate(opts) {
  if (opts.unknown.length) return `Unknown argument(s): ${opts.unknown.join(', ')}`;
  if (opts.missingValue.length) return `Missing value for: ${opts.missingValue.join(', ')}`;

  const hasAction = opts.list || opts.resetPassword !== null || opts.reset2fa || opts.promoteOwner || opts.createOwner;
  if (!hasAction) return 'No action requested.';

  if (opts.createOwner && (!opts.email || !opts.username || !opts.password)) {
    return '--create-owner requires --email <email>, --username <username> and --password <password>.';
  }
  const needsEmail = opts.resetPassword !== null || opts.reset2fa || opts.promoteOwner;
  if (needsEmail && !opts.email) return 'This action requires --email <email>.';
  if (opts.resetPassword !== null && !opts.resetPassword.trim()) return 'The new password must not be empty.';
  return null;
}

const USAGE_ROWS = [
  ['--list', 'print every staff account with status, 2FA and roles'],
  ['--email <email> --reset-password <newPassword>', 'set a fresh password and invalidate old tokens'],
  ['--email <email> --reset-2fa', 'disable 2FA and clear the stored secret and backup codes'],
  ['--email <email> --promote-owner', 'grant platform_owner and tenant_owner on the default tenant'],
  ['--create-owner --email <email> --username <username> --password <password>', 'create the account and grant the owner roles'],
];

function usage() {
  const width = Math.max(...USAGE_ROWS.map(([flags]) => flags.length));
  return [
    'Usage: node scripts/staff-recover.mjs [options]',
    '',
    ...USAGE_ROWS.map(([flags, description]) => `  ${flags.padEnd(width)}  ${description}`),
    '',
    'MONGODB_URI (or the caller-supplied dbUri) is required. Exit codes: 0 success, 1 error.',
  ].join('\n');
}

function databaseName(uri) {
  const withoutOptions = String(uri).split('?')[0];
  return withoutOptions.slice(withoutOptions.lastIndexOf('/') + 1);
}

async function withConnection(dbUri, run) {
  // Reuse an open connection (a test process, or a caller that already connected) and
  // leave it open; only a connection opened here is closed again.
  if (mongoose.connection.readyState === 1) {
    if (dbUri && databaseName(dbUri) !== mongoose.connection.name) {
      throw new Error(`Refusing to run: this process is connected to "${mongoose.connection.name}", not "${databaseName(dbUri)}".`);
    }
    return run();
  }

  if (!dbUri) {
    throw new Error('MONGODB_URI is not set; refusing to guess a database. Run with the same env as the server.');
  }
  await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 5000 });
  try {
    return await run();
  } finally {
    await mongoose.disconnect();
  }
}

async function findStaffByEmail(email, selectPaths) {
  const normalized = String(email).trim().toLowerCase();
  let query = StaffAccount.findOne({ email: normalized });
  if (selectPaths) query = query.select(selectPaths);
  const staff = await query;
  if (!staff) throw new Error(`No staff account with email "${normalized}".`);
  return staff;
}

// The scoped role templates carry scopeId null; per-scope copies exist only in multi installs.
async function findScopedRole(name, scopeType) {
  return Role.findOne({ name, scopeType, scopeId: null }) || Role.findOne({ name, scopeType });
}

async function requireDefaultTenant() {
  const tenant = await Tenant.findOne({ isDefault: true }) || await Tenant.findOne({ key: 'default' });
  if (!tenant) throw new Error('No default tenant found; run the default-tenant boot step (G1) first.');
  return tenant;
}

async function grantOwnerRoles(staff, logger) {
  const granted = [];
  for (const scopeType of ['platform', 'tenant']) {
    const name = OWNER_ROLE_NAMES[scopeType];
    const role = await findScopedRole(name, scopeType);
    if (!role) {
      throw new Error(`Role "${name}" (scopeType: ${scopeType}) is missing; seed the scoped role templates first.`);
    }
    const scopeId = scopeType === 'tenant' ? (await requireDefaultTenant())._id : null;

    const existing = await RoleAssignment.findOne({ staffId: staff._id, roleId: role._id, scopeType, scopeId });
    if (existing) {
      logger.log(`staff-recover: ${staff.email} already holds ${name} (${scopeType}).`);
      granted.push({ role: name, scopeType, assigned: false });
      continue;
    }

    await RoleAssignment.create({ staffId: staff._id, roleId: role._id, scopeType, scopeId });
    logger.log(`staff-recover: granted ${name} to ${staff.email} (scope: ${scopeType}).`);
    granted.push({ role: name, scopeType, assigned: true });
  }
  return granted;
}

async function listStaff(logger) {
  const staffAccounts = await StaffAccount.find({}).sort({ email: 1 });
  const assignments = await RoleAssignment.find({}).populate('roleId');
  const rolesByStaff = new Map();
  for (const assignment of assignments) {
    const key = String(assignment.staffId);
    if (!rolesByStaff.has(key)) rolesByStaff.set(key, []);
    rolesByStaff.get(key).push(`${assignment.roleId?.name ?? 'missing-role'}:${assignment.scopeType}`);
  }

  if (!staffAccounts.length) {
    logger.log('staff-recover: no staff accounts found.');
    return { action: 'list', count: 0 };
  }

  const headers = ['email', 'username', 'status', '2fa', 'roles'];
  const rows = staffAccounts.map((staff) => [
    staff.email,
    staff.username,
    staff.status,
    staff.twoFactor?.enabled ? 'on' : 'off',
    rolesByStaff.get(String(staff._id))?.join(', ') || '-',
  ]);
  const widths = headers.map((header, col) => Math.max(header.length, ...rows.map((row) => String(row[col]).length)));
  const line = (cells) => cells.map((cell, col) => String(cell).padEnd(widths[col])).join('  ');

  logger.log(line(headers));
  logger.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) logger.log(line(row));
  logger.log(`staff-recover: ${staffAccounts.length} staff account(s).`);

  return { action: 'list', count: staffAccounts.length };
}

async function resetPassword(email, newPassword, logger) {
  const staff = await findStaffByEmail(email, '+password');
  staff.password = newPassword;
  staff.tokenVersion = (staff.tokenVersion || 0) + 1;
  await staff.save();
  logger.log(`staff-recover: password reset for ${staff.email}; tokenVersion=${staff.tokenVersion}, existing sessions are invalid.`);
  return { action: 'reset-password', email: staff.email, tokenVersion: staff.tokenVersion };
}

async function reset2fa(email, logger) {
  const staff = await findStaffByEmail(email);
  staff.set({
    'twoFactor.enabled': false,
    'twoFactor.secretEnc': null,
    'twoFactor.backupCodesHash': [],
  });
  staff.tokenVersion = (staff.tokenVersion || 0) + 1;
  await staff.save();
  logger.log(`staff-recover: 2FA disabled for ${staff.email}; tokenVersion=${staff.tokenVersion}, existing sessions are invalid.`);
  return { action: 'reset-2fa', email: staff.email, tokenVersion: staff.tokenVersion };
}

async function promoteOwner(email, logger) {
  const staff = await findStaffByEmail(email);
  const granted = await grantOwnerRoles(staff, logger);
  return { action: 'promote-owner', email: staff.email, granted };
}

async function createOwner(opts, logger) {
  const email = String(opts.email).trim().toLowerCase();
  let staff = await StaffAccount.findOne({ email });
  let created = false;

  if (staff) {
    logger.log(`staff-recover: ${email} already exists; its password and 2FA state are left untouched.`);
  } else {
    staff = await StaffAccount.create({
      email,
      username: opts.username,
      password: opts.password,
      status: 'active',
    });
    created = true;
    logger.log(`staff-recover: created staff account ${staff.email} (username: ${staff.username}).`);
  }

  const granted = await grantOwnerRoles(staff, logger);
  return { action: 'create-owner', email: staff.email, created, granted };
}

async function runActions(opts, logger) {
  const results = [];
  if (opts.list) results.push(await listStaff(logger));
  if (opts.createOwner) results.push(await createOwner(opts, logger));
  if (opts.resetPassword !== null) results.push(await resetPassword(opts.email, opts.resetPassword, logger));
  if (opts.reset2fa) results.push(await reset2fa(opts.email, logger));
  if (opts.promoteOwner) results.push(await promoteOwner(opts.email, logger));
  return results;
}

/**
 * Execute recovery actions.
 *
 * @param {string[]} args CLI arguments, e.g. ['--email', 'a@b.c', '--reset-2fa']
 * @param {{ dbUri?: string, logger?: { log: Function, error: Function } }} [options]
 * @returns {Promise<{ success: boolean, results?: object[], error?: string }>}
 */
export async function runStaffRecover(args = [], options = {}) {
  const logger = options.logger ?? console;
  const opts = parseArgs(args);

  if (opts.help) {
    logger.log(usage());
    return { success: true, results: [{ action: 'help' }] };
  }

  const problem = validate(opts);
  if (problem) {
    const message = `${problem}\n${usage()}`;
    logger.error(`staff-recover: ${message}`);
    return { success: false, error: message };
  }

  try {
    const results = await withConnection(options.dbUri ?? process.env.MONGODB_URI, () => runActions(opts, logger));
    return { success: true, results };
  } catch (err) {
    const message = err?.message || String(err);
    logger.error(`staff-recover: ${message}`);
    return { success: false, error: message };
  }
}

export async function main({ argv = process.argv.slice(2) } = {}) {
  const { config: loadEnv } = requireFromServer('dotenv');
  loadEnv({ path: join(__dirname, '..', '.env') });
  loadEnv({ path: join(__dirname, '..', 'server', '.env') });
  const result = await runStaffRecover(argv);
  if (!result.success) process.exitCode = 1;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`staff-recover: ${err?.message || err}`);
    process.exitCode = 1;
  });
}
