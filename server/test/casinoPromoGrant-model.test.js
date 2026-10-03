import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import CasinoPromoGrant, { effectiveStatus } from '../src/models/CasinoPromoGrant.js';

describe('effectiveStatus (saf fonksiyon)', () => {
  it('freeRound + active + geçmiş expiresAt → expired', () => {
    const past = new Date(Date.now() - 1000);
    const status = effectiveStatus({ kind: 'freeRound', status: 'active', expiresAt: past });
    assert.equal(status, 'expired');
  });

  it('freeRound + active + gelecek expiresAt → active', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const status = effectiveStatus({ kind: 'freeRound', status: 'active', expiresAt: future });
    assert.equal(status, 'active');
  });

  it('bonusCall + running → running (expiresAt yok, dokunulmaz)', () => {
    const status = effectiveStatus({ kind: 'bonusCall', status: 'running' });
    assert.equal(status, 'running');
  });

  it('freeRound + cancelled (geçmiş tarih olsa da) → cancelled', () => {
    const past = new Date(Date.now() - 1000);
    const status = effectiveStatus({ kind: 'freeRound', status: 'cancelled', expiresAt: past });
    assert.equal(status, 'cancelled');
  });
});

describe('CasinoPromoGrant modeli', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_casino_promo_grant_model');
    await CasinoPromoGrant.init(); // index'lerin (callId sparse unique dahil) kurulmasını bekle
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => { await CasinoPromoGrant.deleteMany({}); });

  it('kind enum dışı bir değerle ValidationError fırlatır', async () => {
    const userId = new mongoose.Types.ObjectId();
    await assert.rejects(
      () => CasinoPromoGrant.create({ kind: 'notAKind', user: userId, username: 'x' }),
      (err) => err.name === 'ValidationError'
    );
  });

  it('callId sparse unique — iki null kayıt çakışmaz', async () => {
    const userId = new mongoose.Types.ObjectId();
    await CasinoPromoGrant.create({ kind: 'freeRound', user: userId, username: 'a' });
    await CasinoPromoGrant.create({ kind: 'freeRound', user: userId, username: 'b' });
    const count = await CasinoPromoGrant.countDocuments({});
    assert.equal(count, 2);
  });

  it('aynı callId ile iki kayıt oluşturulamaz', async () => {
    const userId = new mongoose.Types.ObjectId();
    await CasinoPromoGrant.create({ kind: 'bonusCall', user: userId, username: 'a', callId: 555 });
    await assert.rejects(
      () => CasinoPromoGrant.create({ kind: 'bonusCall', user: userId, username: 'b', callId: 555 })
    );
  });

  it('schema.statics.effectiveStatus da aynı sonucu verir', async () => {
    const userId = new mongoose.Types.ObjectId();
    const grant = await CasinoPromoGrant.create({
      kind: 'freeRound', user: userId, username: 'a', status: 'active',
      expiresAt: new Date(Date.now() - 1000),
    });
    assert.equal(CasinoPromoGrant.effectiveStatus(grant), 'expired');
  });
});
