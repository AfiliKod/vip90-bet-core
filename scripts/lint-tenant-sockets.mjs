#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RULES = [
  {
    id: 'no-global-io-emit',
    re: /\bio\.emit\s*\(/g,
    message: 'io.emit is banned; publish to a tenant room through socket/publish.js',
  },
  {
    id: 'no-admin-role-room',
    re: /\brole:admin\b/g,
    message: "the role:admin room is banned; use adminRoom(tenantId)",
  },
];

// Reviewer correction (2026-11-12): single mode before G1 keeps today's admin
// room name, defined once as the LEGACY_ADMIN_ROOM constant. The literal is
// allowed only on that definition line, nowhere else.
const LEGACY_ADMIN_ROOM_FILE = 'server/src/tenancy/tenantKeys.js';
const LEGACY_ADMIN_ROOM_DEFINITION = /^\s*export const LEGACY_ADMIN_ROOM = 'role:admin';\s*$/;

function isLegacyAdminRoomDefinition(file, line) {
  return String(file).replaceAll('\\', '/') === LEGACY_ADMIN_ROOM_FILE
    && LEGACY_ADMIN_ROOM_DEFINITION.test(line);
}

function isCommentOnly(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function scanSource(source, file = '<inline>') {
  const violations = [];
  const lines = String(source).split(/\r?\n/);
  for (const rule of RULES) {
    for (let i = 0; i < lines.length; i += 1) {
      if (isCommentOnly(lines[i])) continue;
      if (rule.id === 'no-admin-role-room' && isLegacyAdminRoomDefinition(file, lines[i])) continue;
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(lines[i])) !== null) {
        violations.push({
          file, line: i + 1, column: match.index + 1,
          rule: rule.id, message: rule.message,
        });
      }
    }
  }
  return violations.sort((a, b) => a.line - b.line || a.column - b.column);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(full);
  }
  return files;
}

export function scanTree(root = 'server/src') {
  return walk(root).flatMap((file) => scanSource(readFileSync(file, 'utf8'), file));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = scanTree('server/src');
  for (const v of violations) {
    console.error(`${v.file}:${v.line}:${v.column} ${v.rule} ${v.message}`);
  }
  if (violations.length > 0) process.exitCode = 1;
  else console.log('tenant socket lint: clean');
}