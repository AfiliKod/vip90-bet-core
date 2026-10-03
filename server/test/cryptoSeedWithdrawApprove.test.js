import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Transaction from '../src/models/Transaction.js';
import User from '../src/models/User.js';
import { approveCryptoWithdrawal } from '../src/controllers/admin.js';

// Demo (isSeed) kripto çekimi onaylanınca zincire transfer denenmemeli.
describe('approveCryptoWithdrawal — demo kaydı', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_cryptoseedwd');
    await Promise.all([Transaction.deleteMany({}), User.deleteMany({})]);
  });
  after(async () => {
    await Promise.all([Transaction.deleteMany({}), User.deleteMany({})]);
    await mongoose.disconnect();
  });

  it('isSeed çekim transfersiz tamamlanır', async () => {
    const u = await User.create({ username: 'seedwd', email: 'seedwd@test.local', password: 'Password1' });
    // Gerçek biçimli bir adres: eski kod bunu parse edip transferUSDT çağırırdı.
    const tx = await Transaction.create({
      userId: u._id, type: 'crypto_withdraw', amount: 100, balanceBefore: 500, balanceAfter: 400,
      status: 'pending', isSeed: true,
      note: 'Çekim: 10.00 USDT → TXYZabcdefghijkmnopqrstuvwxyz12345',
    });
    let body; let code = 200;
    const res = { status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    await approveCryptoWithdrawal({ params: { id: String(tx._id) } }, res, e => { throw e; });
    assert.equal(code, 200);
    assert.equal(body.demo, true);
    assert.equal((await Transaction.findById(tx._id)).status, 'completed');
  });
});
