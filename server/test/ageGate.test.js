import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enforceAgeGate, hasAgeConsent, isAdultDateOfBirth } from '../src/middleware/ageGate.js';

const call = async (mw, req = {}) => {
  let nextArg; let called = false;
  await mw({ user: null, body: {}, path: '/', ...req }, {}, (e) => { called = true; nextArg = e; });
  return { called, err: nextArg };
};

describe('enforceAgeGate', () => {
  it('oturumsuz isteği geçirir (HMAC /callback ve public uçlar)', async () => {
    const mw = enforceAgeGate({ findUser: async () => { throw new Error('çağrılmamalı'); } });
    assert.equal((await call(mw)).err, undefined);
  });

  it('beyan kaydı (ageConfirmedAt) varsa geçirir', async () => {
    const mw = enforceAgeGate({ findUser: async () => ({ ageConfirmedAt: new Date() }) });
    assert.equal((await call(mw, { user: { id: 'u1' } })).err, undefined);
  });

  it('doğrulama kaydı (ageVerifiedAt) varsa geçirir', async () => {
    const mw = enforceAgeGate({ findUser: async () => ({ ageVerifiedAt: new Date() }) });
    assert.equal((await call(mw, { user: { id: 'u1' } })).err, undefined);
  });

  it('hiçbir kayıt yoksa 403 AGE_CONFIRMATION_REQUIRED', async () => {
    const mw = enforceAgeGate({ findUser: async () => ({ ageConfirmedAt: null, ageVerifiedAt: null }) });
    const { err } = await call(mw, { user: { id: 'u1' } });
    assert.equal(err.status, 403);
    assert.equal(err.code, 'AGE_CONFIRMATION_REQUIRED');
  });

  it('kullanıcı DB hatası → fail-open (erişilemeyen kayıt oyuncuyu kilitlemez)', async () => {
    const mw = enforceAgeGate({ findUser: async () => { throw new Error('mongo down'); } });
    assert.equal((await call(mw, { user: { id: 'u1' } })).err, undefined);
  });

  it('kullanıcı bulunamazsa geçirir (silinmiş hesap oyun akışını bozmaz)', async () => {
    const mw = enforceAgeGate({ findUser: async () => null });
    assert.equal((await call(mw, { user: { id: 'u1' } })).err, undefined);
  });
});

describe('hasAgeConsent', () => {
  it('beyan veya doğrulama varsa true', () => {
    assert.equal(hasAgeConsent({ ageConfirmedAt: new Date() }), true);
    assert.equal(hasAgeConsent({ ageVerifiedAt: new Date() }), true);
  });

  it('ikisi de yoksa false', () => {
    assert.equal(hasAgeConsent({ ageConfirmedAt: null, ageVerifiedAt: null }), false);
    assert.equal(hasAgeConsent(null), false);
  });
});

describe('isAdultDateOfBirth', () => {
  const now = new Date('2026-10-08T00:00:00Z');

  it('18 yaşını geçmiş doğum tarihi → true', () => {
    assert.equal(isAdultDateOfBirth('2000-01-01', now), true);
  });

  it('18 yaşını geçmemiş → false', () => {
    assert.equal(isAdultDateOfBirth('2015-01-01', now), false);
  });

  it('tam 18. doğum günü sınırda: saat bazında doğru sonuç verir', () => {
    // 2008-10-08 → bugün tam 18. yıl → true
    assert.equal(isAdultDateOfBirth('2008-10-08', new Date('2026-10-08T12:00:00Z')), true);
    // 2008-10-09 → henüz 18 değil → false
    assert.equal(isAdultDateOfBirth('2008-10-09', new Date('2026-10-08T12:00:00Z')), false);
  });

  it('tarih yoksa null (beyan yeterli, doğrulama yapılamaz)', () => {
    assert.equal(isAdultDateOfBirth(null, now), null);
  });

  it('geçersiz tarih null döner', () => {
    assert.equal(isAdultDateOfBirth('abc', now), null);
  });
});