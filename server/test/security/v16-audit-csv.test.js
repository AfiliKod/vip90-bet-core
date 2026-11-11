process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { csvCell } from '../../src/services/audit.js';

describe('V16 csvCell', () => {
  it('formula injection is neutralised and the cell is quoted', () => {
    assert.equal(csvCell('=SUM(A1)'), `"'=SUM(A1)"`);
    assert.equal(csvCell('+1'), `"'+1"`);
    assert.equal(csvCell('-1'), `"'-1"`);
    assert.equal(csvCell('@x'), `"'@x"`);
    assert.equal(csvCell('\tx'), `"'\tx"`);
    assert.equal(csvCell('\rx'), `"'\rx"`);
  });
  it('hostile prefix plus separators is neutralised and quoted', () => {
    assert.equal(csvCell('=HYPERLINK("http://e","x"),y'), `"'=HYPERLINK(""http://e"",""x""),y"`);
  });
  it('semicolon (Turkish-locale Excel separator) cannot start a formula cell', () => {
    assert.equal(csvCell('x;=HYPERLINK("http://e")'), `"x;=HYPERLINK(""http://e"")"`);
    assert.equal(csvCell('a;b'), '"a;b"');
  });
  it('commas, quotes and newlines are quoted', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('a"b'), '"a""b"');
    assert.equal(csvCell('a\nb'), '"a\nb"');
    assert.equal(csvCell('a\r\nb'), '"a\r\nb"');
  });
  it('null and undefined are empty; everything else is quoted', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
    assert.equal(csvCell(true), '"true"');
    assert.equal(csvCell(5), '"5"');
    assert.equal(csvCell('plain'), '"plain"');
  });
});

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/v16_audit_csv_test';

describe('V16 /api/admin/audit/export permissions', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  let server; let base; let User; let Role; let Permission; let AuditLog;
  const users = {};
  const names = ['v16auditonly', 'v16auditexport', 'v16none'];

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (connected) {
      await User.deleteMany({ username: { $in: names } });
      await Role.deleteMany({ name: /^v16_/ });
      await AuditLog.deleteMany({ actorUsername: '=v16evil' });
      await mongoose.disconnect();
    }
  });

  const get = (path, user) => fetch(base + path, { headers: { Authorization: `Bearer ${jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET)}` } });

  it('setup', opts, async () => {
    ({ default: User } = await import('../../src/models/User.js'));
    ({ default: Role } = await import('../../src/models/Role.js'));
    ({ default: Permission } = await import('../../src/models/Permission.js'));
    ({ default: AuditLog } = await import('../../src/models/AuditLog.js'));
    const { createApp } = await import('../../src/app.js');
    await User.deleteMany({ username: { $in: names } });
    await Role.deleteMany({ name: /^v16_/ });
    const perm = (key) => Permission.findOneAndUpdate({ key }, { $setOnInsert: { name: key, category: 'x' } }, { upsert: true, new: true });
    const pRead = await perm('admin:audit:read');
    const pExp = await perm('admin:reports:export');
    const rRead = await Role.create({ name: 'v16_read', displayName: 'v16', permissions: [pRead._id] });
    const rBoth = await Role.create({ name: 'v16_both', displayName: 'v16', permissions: [pRead._id, pExp._id] });
    const rNone = await Role.create({ name: 'v16_none', displayName: 'v16', permissions: [] });
    const mk = (username, roles) => User.create({ username, email: `${username}@test.dev`, password: 'Pass1234!', role: 'admin', roles });
    users.read = await mk('v16auditonly', [rRead._id]);
    users.both = await mk('v16auditexport', [rBoth._id]);
    users.none = await mk('v16none', [rNone._id]);
    await AuditLog.create({ actorUsername: '=v16evil', actorType: 'admin', action: 'X', category: 'system', targetType: 'user', success: true });
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  it('audit:read only -> export 403', opts, async () => {
    assert.equal((await get('/api/admin/audit/export', users.read)).status, 403);
  });
  it('no audit permission -> logs 403', opts, async () => {
    assert.equal((await get('/api/admin/audit/logs', users.none)).status, 403);
  });
  it('audit:read + reports:export -> 200, BOM, escaped cells, CRLF', opts, async () => {
    const r = await get('/api/admin/audit/export', users.both);
    assert.equal(r.status, 200);
    const buf = Buffer.from(await r.arrayBuffer()); // res.text() would strip the BOM
    assert.deepEqual([...buf.subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    const body = buf.toString('utf8');
    assert.ok(body.startsWith('\uFEFF"Date","Actor"'));
    assert.ok(body.includes(`"'=v16evil`));
    assert.ok(body.includes('\r\n'));
  });
});
