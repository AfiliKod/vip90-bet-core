import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Role from '../src/models/Role.js';
import Permission from '../src/models/Permission.js';
import Transaction from '../src/models/Transaction.js';
import BankDepositRequest from '../src/models/BankDepositRequest.js';
import { initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import adminRouter from '../src/routes/admin.js';

// Router zincirini (requirePermission → controller) sahte req/res ile çalıştırır.
function findRoute(path) {
  const layer = adminRouter.stack.find(l => l.route && l.route.path === path && l.route.methods.get);
  assert.ok(layer, `GET ${path} rotası bulunamadı`);
  return layer.route.stack.map(s => s.handle);
}

async function get(path, user) {
  const req = { user, body: {}, query: {}, params: {}, headers: {}, ip: '127.0.0.1', baseUrl: '/api/admin' };
  const out = { status: 200, body: null, error: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; }, on() {} };
  for (const h of findRoute(path)) {
    let proceeded = false;
    let err = null;
    await new Promise((resolve) => {
      const origJson = res.json.bind(res);
      res.json = (b) => { origJson(b); resolve(); return res; };
      Promise.resolve(h(req, res, (e) => { proceeded = true; err = e || null; resolve(); })).catch((e) => { err = e; resolve(); });
    });
    if (err) { out.error = err; out.status = err.status || 500; return out; }
    if (!proceeded) return out;
  }
  return out;
}

describe('GET /admin/bank/stats ve /admin/crypto/stats', () => {
  let admin; let noPerm; let player;
  before(async () => { await mongoose.connect('mongodb://localhost:27017/betzone_test_wallet_stats'); });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([User, Role, Permission, Transaction, BankDepositRequest].map(m => m.deleteMany({})));
    await initDefaultPermissions();
    await initDefaultRoles();
    const sa = await Role.findOne({ name: 'super_admin' });
    admin = await User.create({ username: 'statsadm', email: 'sa@t.com', password: 'x', role: 'admin', roles: [sa._id] });
    noPerm = await User.create({ username: 'statsnoperm', email: 'np@t.com', password: 'x', role: 'user' });
    player = await User.create({ username: 'statsplayer', email: 'p@t.com', password: 'x' });
  });

  const tx = (type, amount, status) => Transaction.create({ userId: player._id, type, amount, status, balanceBefore: 0, balanceAfter: 0 });

  it('yetkisiz kullanıcı 403 alır', async () => {
    for (const path of ['/bank/stats', '/crypto/stats']) {
      const out = await get(path, noPerm);
      assert.equal(out.status, 403, path);
    }
  });

  it('bank/stats: yalnız onaylı talepler toplanır, count tüm talepler', async () => {
    await BankDepositRequest.create([
      { userId: player._id, type: 'deposit', amount: 1000, status: 'approved' },
      { userId: player._id, type: 'deposit', amount: 500, status: 'approved' },
      { userId: player._id, type: 'deposit', amount: 900, status: 'pending' },
      { userId: player._id, type: 'withdraw', amount: 400, status: 'approved' },
      { userId: player._id, type: 'withdraw', amount: 300, status: 'rejected' },
    ]);
    const out = await get('/bank/stats', admin);
    assert.equal(out.status, 200);
    assert.equal(out.body.deposits.total, 1500);
    assert.equal(out.body.payouts.total, 400);
    assert.equal(out.body.net, 1100);
    assert.equal(out.body.count, 5);
  });

  it('crypto/stats: tamamlanan yatırma/çekim toplanır, çekim iadesi çekim sayılmaz', async () => {
    await tx('crypto_deposit', 200, 'completed');
    await tx('crypto_deposit', 50, 'pending');
    await tx('crypto_deposit', 70, 'rejected');
    await tx('crypto_withdraw', -80, 'completed');
    await tx('crypto_withdraw', -60, 'pending');
    await tx('crypto_withdraw', -40, 'rejected');
    await tx('crypto_withdraw', 40, 'completed'); // reddedilen çekimin iade kaydı
    const out = await get('/crypto/stats', admin);
    assert.equal(out.status, 200);
    assert.equal(out.body.deposits.total, 200);
    assert.equal(out.body.payouts.total, 80);
    assert.equal(out.body.net, 120);
    assert.equal(out.body.count, 6);
  });

  it('veri yokken sıfır döner', async () => {
    for (const path of ['/bank/stats', '/crypto/stats']) {
      const out = await get(path, admin);
      assert.deepEqual([out.body.deposits.total, out.body.payouts.total, out.body.net, out.body.count], [0, 0, 0, 0], path);
    }
  });
});
