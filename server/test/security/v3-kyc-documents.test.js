process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY = 'c'.repeat(64);
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.KYC_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'v3-kyc-docs-'));
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const URI = 'mongodb://localhost:27017/v3_kyc_documents_test';

describe('V3 KYC belgeleri kimlik doğrulamalı sunulur', async () => {
  let connected = false;
  try { await mongoose.connect(URI, { serverSelectionTimeoutMS: 2000 }); connected = true; } catch { /* skip */ }
  const opts = { skip: !connected && 'MongoDB yok' };
  let server; let base; let KycDocument; let User; let Role; let Permission; let kycConfig;
  const names = ['v3owner', 'v3other', 'v3kycadmin', 'v3plainadmin'];

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (connected) {
      await User.deleteMany({ username: { $in: names } });
      await KycDocument.deleteMany({ fileName: /^v3-/ });
      await Role.deleteMany({ name: /^v3_/ });
      await Permission.deleteMany({ key: 'admin:kyc:read' });
      await mongoose.disconnect();
    }
    rmSync(process.env.KYC_UPLOAD_DIR, { recursive: true, force: true });
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  const tok = (u) => jwt.sign({ id: u._id, role: u.role, tokenVersion: u.tokenVersion || 0 }, process.env.JWT_SECRET);
  const get = (path, user) => fetch(base + path, { headers: user ? { Authorization: `Bearer ${tok(user)}` } : {} });
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

  const users = {};
  let docId; let storageKey;

  it('hazırlık', opts, async () => {
    ({ default: KycDocument } = await import('../../src/models/KycDocument.js'));
    ({ default: User } = await import('../../src/models/User.js'));
    ({ default: Role } = await import('../../src/models/Role.js'));
    ({ default: Permission } = await import('../../src/models/Permission.js'));
    ({ kycConfig } = await import('../../src/config/kyc.js'));
    const { createApp } = await import('../../src/app.js');
    await User.deleteMany({ username: { $in: names } });
    await Role.deleteMany({ name: /^v3_/ });
    const perm = await Permission.findOneAndUpdate({ key: 'admin:kyc:read' }, { $setOnInsert: { name: 'KYC', category: 'kyc' } }, { upsert: true, new: true });
    const withPerm = await Role.create({ name: 'v3_kyc', displayName: 'v3', permissions: [perm._id] });
    const noPerm = await Role.create({ name: 'v3_none', displayName: 'v3', permissions: [] });
    const mk = (username, extra = {}) => User.create({ username, email: `${username}@test.dev`, password: 'Pass1234!', ...extra });
    users.owner = await mk('v3owner');
    users.other = await mk('v3other');
    users.kycAdmin = await mk('v3kycadmin', { role: 'admin', roles: [withPerm._id] });
    users.plainAdmin = await mk('v3plainadmin', { role: 'admin', roles: [noPerm._id] });
    await kycConfig.set?.('KYC_PROVIDER', 'manual');
    await kycConfig.set?.('KYC_ENABLED', 'true');
    server = createApp().listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  it('yükleme storageKey yazar, fileUrl boş; dosya KYC_UPLOAD_DIR altında', opts, async () => {
    const fd = new FormData();
    fd.append('documentType', 'identity_card');
    fd.append('documents', new Blob([PNG], { type: 'image/png' }), 'v3-id.png');
    // Tam uygulamada kyc-verification modül kapısı (lisans) testte kapalı; gerçek
    // yükleme rotası (multer + route) aynı yolla bir mini uygulamada çalıştırılır.
    const { default: express } = await import('express');
    const { default: kycRoutes } = await import('../../src/routes/kyc.js');
    const mini = express();
    mini.use('/api/kyc', kycRoutes);
    const miniServer = mini.listen(0);
    await new Promise((r) => miniServer.once('listening', r));
    const r = await fetch(`http://127.0.0.1:${miniServer.address().port}/api/kyc/documents`, { method: 'POST', headers: { Authorization: `Bearer ${tok(users.owner)}` }, body: fd });
    assert.equal(r.status, 200, await r.clone().text());
    await new Promise((res) => miniServer.close(res));
    const { documents } = await r.json();
    assert.equal(documents.length, 1);
    assert.ok(documents[0].storageKey);
    assert.ok(!documents[0].fileUrl);
    docId = documents[0]._id; storageKey = documents[0].storageKey;
    assert.ok(existsSync(join(process.env.KYC_UPLOAD_DIR, storageKey)));
    assert.ok(readdirSync(process.env.KYC_UPLOAD_DIR).includes(storageKey));
  });

  it('statik /uploads/kyc/<dosya> artık 404', opts, async () => {
    const r = await fetch(`${base}/uploads/kyc/${storageKey}`);
    assert.equal(r.status, 404);
  });

  it('kimlik doğrulamasız indirme 401', opts, async () => {
    assert.equal((await get(`/api/kyc/documents/${docId}`)).status, 401);
  });

  it('sahibi kendi belgesini indirir, content-type doğru', opts, async () => {
    const r = await get(`/api/kyc/documents/${docId}`, users.owner);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('content-disposition'), 'inline');
    assert.equal(r.headers.get('content-security-policy'), 'sandbox');
    assert.deepEqual(Buffer.from(await r.arrayBuffer()), PNG);
  });

  it('başka oyuncu 403 FORBIDDEN (var olmayan belge için de aynı)', opts, async () => {
    const r = await get(`/api/kyc/documents/${docId}`, users.other);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, 'FORBIDDEN');
    const ghost = await get(`/api/kyc/documents/${new mongoose.Types.ObjectId()}`, users.other);
    assert.equal(ghost.status, 403);
  });

  it('admin:kyc:read + izinli IP -> 200; izin listesi dışında 403 ADMIN_IP_NOT_ALLOWED', opts, async () => {
    delete process.env.ADMIN_ALLOWED_IPS;
    assert.equal((await get(`/api/kyc/documents/${docId}`, users.kycAdmin)).status, 200);
    process.env.ADMIN_ALLOWED_IPS = '127.0.0.1';
    assert.equal((await get(`/api/kyc/documents/${docId}`, users.kycAdmin)).status, 200);
    process.env.ADMIN_ALLOWED_IPS = '203.0.113.0/24';
    const r = await get(`/api/kyc/documents/${docId}`, users.kycAdmin);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error.code, 'ADMIN_IP_NOT_ALLOWED');
    delete process.env.ADMIN_ALLOWED_IPS;
  });

  it('admin:kyc:read olmayan admin 403', opts, async () => {
    const r = await get(`/api/kyc/documents/${docId}`, users.plainAdmin);
    assert.equal(r.status, 403);
  });

  it('yetkili admin var olmayan belge için 404', opts, async () => {
    assert.equal((await get(`/api/kyc/documents/${new mongoose.Types.ObjectId()}`, users.kycAdmin)).status, 404);
  });

  it('id içinde ../ reddedilir', opts, async () => {
    for (const bad of ['..%2F..%2Fetc%2Fpasswd', '%2e%2e%2f%2e%2e%2fsecret', 'not-an-id']) {
      const r = await get(`/api/kyc/documents/${bad}`, users.owner);
      assert.ok([400, 404].includes(r.status), `${bad} -> ${r.status}`);
    }
  });

  it('storageKey içindeki yol geçişi dosya dışına çıkamaz', opts, async () => {
    const d = await KycDocument.create({ userId: users.owner._id, documentType: 'passport', fileName: 'v3-evil', fileSize: 1, mimeType: 'image/png', storageKey: '../../../../etc/passwd' });
    const r = await get(`/api/kyc/documents/${d._id}`, users.owner);
    assert.equal(r.status, 404);
  });

  it('eski konumdaki (uploads/kyc) dosya sahibine ve yetkili admine servis edilir; taşınınca yeni konum kullanılır', opts, async () => {
    const { SERVER_ROOT } = await import('../../src/config/paths.js');
    const legacy = join(SERVER_ROOT, 'uploads', 'kyc');
    mkdirSync(legacy, { recursive: true });
    const name = `v3-legacy-${Date.now()}.png`;
    const body = Buffer.from('legacy-bytes');
    writeFileSync(join(legacy, name), body);
    try {
      const d = await KycDocument.create({ userId: users.owner._id, documentType: 'passport', fileName: 'v3-legacy', fileSize: 1, mimeType: 'image/png', fileUrl: `/uploads/kyc/${name}` });
      for (const u of [users.owner, users.kycAdmin]) {
        const r = await get(`/api/kyc/documents/${d._id}`, u);
        assert.equal(r.status, 200);
        assert.deepEqual(Buffer.from(await r.arrayBuffer()), body);
      }
      assert.equal((await get(`/api/kyc/documents/${d._id}`, users.other)).status, 403);
      // taşındıktan sonra yeni konum kullanılır
      renameSync(join(legacy, name), join(process.env.KYC_UPLOAD_DIR, name));
      const r2 = await get(`/api/kyc/documents/${d._id}`, users.owner);
      assert.equal(r2.status, 200);
      assert.deepEqual(Buffer.from(await r2.arrayBuffer()), body);
    } finally {
      rmSync(join(legacy, name), { force: true });
      rmSync(join(process.env.KYC_UPLOAD_DIR, name), { force: true });
    }
  });

  it('eski fileUrl üzerinden yol geçişi reddedilir', opts, async () => {
    const { SERVER_ROOT } = await import('../../src/config/paths.js');
    const secret = join(SERVER_ROOT, 'v3-secret.png');
    writeFileSync(secret, 'secret');
    try {
      for (const fileUrl of ['/uploads/kyc/../../v3-secret.png', '../../v3-secret.png', '/uploads/kyc/.hidden']) {
        const d = await KycDocument.create({ userId: users.owner._id, documentType: 'passport', fileName: 'v3-trav', fileSize: 1, mimeType: 'image/png', fileUrl });
        const r = await get(`/api/kyc/documents/${d._id}`, users.owner);
        assert.equal(r.status, 404, fileUrl);
      }
    } finally { rmSync(secret, { force: true }); }
  });
});
