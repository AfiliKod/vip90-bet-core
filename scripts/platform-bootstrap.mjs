#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const requireFromServer = createRequire(join(__dirname, '..', 'server', 'package.json'));
const mongoose = requireFromServer('mongoose');
const dotenv = requireFromServer('dotenv');

dotenv.config({ path: join(__dirname, '..', '.env') });
dotenv.config({ path: join(__dirname, '..', 'server', '.env') });

import StaffAccount from '../server/src/models/StaffAccount.js';
import Role from '../server/src/models/Role.js';
import RoleAssignment from '../server/src/models/RoleAssignment.js';
import { runPlatformBootstrap } from '../server/src/platform/bootstrap.js';

export function parseBootstrapArgs(argv = []) {
  // Parola komut satırından alınmaz (kabuk geçmişi, `ps`); --password-stdin ile
  // stdin'den okunur, verilmezse rastgele geçici parola üretilir.
  const opts = { ownerEmail: null, username: null, passwordStdin: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--owner-email') opts.ownerEmail = argv[++i];
    else if (argv[i] === '--username') opts.username = argv[++i];
    else if (argv[i] === '--password-stdin') opts.passwordStdin = true;
    else if (argv[i] === '--password') throw new Error('--password is not accepted on the command line; use --password-stdin');
  }
  return opts;
}

export async function bootstrapFirstPlatformOwner({ ownerEmail, username, password } = {}) {
  if (!ownerEmail) throw new Error('--owner-email is required');

  // 1. Ensure bootstrap migrations & roles are in place
  await runPlatformBootstrap({ env: process.env });

  // 2. Check if a platform owner already exists
  const platformOwnerRole = await Role.findOne({ name: 'platform_owner', scopeType: 'platform' });
  if (!platformOwnerRole) throw new Error('Role platform_owner not found. Run bootstrap migration first.');

  const existingAssignment = await RoleAssignment.findOne({
    roleId: platformOwnerRole._id,
    scopeType: 'platform',
  });

  if (existingAssignment) {
    const existingStaff = await StaffAccount.findById(existingAssignment.staffId);
    return {
      created: false,
      alreadyInstalled: true,
      email: existingStaff?.email || 'unknown',
    };
  }

  // 3. Create the first StaffAccount
  const finalUsername = username || ownerEmail.split('@')[0];
  const finalPassword = password || crypto.randomBytes(16).toString('base64url');

  const staff = await StaffAccount.create({
    email: ownerEmail.toLowerCase().trim(),
    username: finalUsername,
    password: finalPassword,
    status: 'active',
    twoFactor: { enabled: false }, // Mandatory 2FA triggers at login
  });

  // 4. Create RoleAssignment
  await RoleAssignment.create({
    staffId: staff._id,
    roleId: platformOwnerRole._id,
    scopeType: 'platform',
    scopeId: null,
  });

  return {
    created: true,
    alreadyInstalled: false,
    email: staff.email,
    username: staff.username,
    generatedPassword: password ? null : finalPassword,
  };
}

async function main() {
  const opts = parseBootstrapArgs(process.argv.slice(2));
  if (!opts.ownerEmail) {
    console.error('Usage: node scripts/platform-bootstrap.mjs --owner-email <email> [--username <name>] [--password-stdin]');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('Error: MONGODB_URI not found in environment.');
    process.exit(1);
  }

  let password = null;
  if (opts.passwordStdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
    if (!password) {
      console.error('Error: --password-stdin given but stdin was empty.');
      process.exit(1);
    }
  }

  await mongoose.connect(mongoUri);
  try {
    const result = await bootstrapFirstPlatformOwner({ ownerEmail: opts.ownerEmail, username: opts.username, password });
    if (result.alreadyInstalled) {
      console.log(`[platform-bootstrap] Platform is already installed. Platform Owner exists: ${result.email}`);
    } else {
      console.log(`[platform-bootstrap] Platform Owner created: ${result.email} (${result.username})`);
      if (result.generatedPassword) {
        console.log(`[platform-bootstrap] Temporary Password: ${result.generatedPassword}`);
      }
      console.log('[platform-bootstrap] Note: 2FA enrollment will be required upon first login.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[platform-bootstrap] Error:', err.message);
    process.exit(1);
  });
}
