// server/test/activity-security-events.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import LoginAttempt from '../src/models/LoginAttempt.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';

// Görev notu (Tasks 5-8 ailesi): ESM namespace mock.method yerine
// settable-seam — logActivity'in socket emit'i test sırasında sessiz olsun;
// after()'da orijinaline geri dönülür.
const ORIGINAL_IO_GETTER = _getIOGetter();

describe("Hesap/güvenlik activity event'leri", () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_activity_security');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await LoginAttempt.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it("notifyAdminsNewKycSubmission çağrıldığında kyc_submitted event yazılır", async () => {
    const user = await User.create({ username: 'kycu1', email: 'kycu1@test.com', password: 'x' });
    const kyc = await import('../src/services/kyc.js');
    // notifyAdminsNewKycSubmission export edilmiyor olabilir — export edilecek (Step aşağıda).
    await kyc._notifyAdminsNewKycSubmissionForTest(user._id, 3);

    const events = await ActivityEvent.find({ userId: user._id, type: 'kyc_submitted' });
    assert.equal(events.length, 1);
    assert.equal(events[0].data.docCount, 3);
    assert.equal(events[0].status, 'pending');
  });

  it('5 başarısız login denemesi sonrası (lockout) login_risk event yazılır', async () => {
    const { login } = await import('../src/controllers/auth.js');

    const user = await User.create({ username: 'lockuser', email: 'lockuser@test.com', password: 'x' });
    // Doğrudan 5 başarısız LoginAttempt kaydı oluşturuyoruz — login()'in kendi
    // "recentFails >= LOGIN_LOCKOUT_THRESHOLD" kontrolü bunları username+ip
    // eşleşmesiyle sayıyor (bkz. controllers/auth.js), şifreyi gerçekten
    // yanlış deneyerek 5 kez POST atmaya gerek yok.
    for (let i = 0; i < 5; i++) {
      await LoginAttempt.create({ userId: user._id, username: 'lockuser', ip: '127.0.0.1', success: false, failReason: 'wrong_password' });
    }

    const req = { validated: { username: 'lockuser', password: 'yanlisSifre1' }, ip: '127.0.0.1', headers: {} };
    let nextErr = null;
    const res = { json: () => {}, status: () => res };
    await login(req, res, (e) => { nextErr = e; });

    assert.ok(nextErr);
    assert.equal(nextErr.code, 'TOO_MANY_ATTEMPTS');

    const events = await ActivityEvent.find({ userId: user._id, type: 'login_risk' });
    assert.equal(events.length, 1);
    assert.equal(events[0].status, 'locked');
    assert.equal(events[0].data.recentFails, 5);
    assert.equal(events[0].data.ip, '127.0.0.1');
  });

  it('kilitliyken art arda gelen istekler login_risk\'i TEKRAR loglamaz (2026-09-23 flood bulgusu)', async () => {
    // Kök neden: kilitli 429 yolu hiç yeni LoginAttempt yazmıyor, bu yüzden
    // recentFails eşikte donuk kalıyor — "sadece eşik geçişinde logla"
    // (=== THRESHOLD) tek başına yeterli değildi, her kilitli istekte yine
    // true oluyordu. Düzeltme: zaman penceresinde zaten bir login_risk
    // event'i varsa tekrar yazma (bkz. controllers/auth.js).
    const { login } = await import('../src/controllers/auth.js');

    const user = await User.create({ username: 'floodlockuser', email: 'floodlockuser@test.com', password: 'x' });
    for (let i = 0; i < 5; i++) {
      await LoginAttempt.create({ userId: user._id, username: 'floodlockuser', ip: '127.0.0.1', success: false, failReason: 'wrong_password' });
    }

    const makeReq = () => ({ validated: { username: 'floodlockuser', password: 'yanlisSifre1' }, ip: '127.0.0.1', headers: {} });
    const res = { json: () => {}, status: () => res };

    for (let i = 0; i < 3; i++) {
      let nextErr = null;
      await login(makeReq(), res, (e) => { nextErr = e; });
      assert.equal(nextErr.code, 'TOO_MANY_ATTEMPTS');
    }

    const events = await ActivityEvent.find({ userId: user._id, type: 'login_risk' });
    assert.equal(events.length, 1, '3 kilitli istek olsa da tek bir login_risk event\'i olmalı — flood olmamalı');
  });
});
