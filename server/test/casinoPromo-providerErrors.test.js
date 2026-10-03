import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isProviderOk, toPromoError } from '../src/services/casinoPromo/providerErrors.js';

describe('isProviderOk', () => {
  it('code === 0 → true', () => {
    assert.equal(isProviderOk({ data: { code: 0 } }), true);
  });

  it('code alanı yok ama data var → true', () => {
    assert.equal(isProviderOk({ data: { call_id: 123 } }), true);
  });

  it('code != 0 → false', () => {
    assert.equal(isProviderOk({ data: { code: 2005, message: 'POINT_NOT_ENOUGH' } }), false);
  });

  it('data yok → false', () => {
    assert.equal(isProviderOk({}), false);
    assert.equal(isProviderOk(null), false);
  });
});

describe('toPromoError — (a) apiRequest sonucu {status, data:{code,message}} code != 0', () => {
  it('1010 PERMISSION_ERROR → PROMO_PERMISSION_DISABLED / 403', () => {
    const e = toPromoError({ status: 200, data: { code: 1010, message: 'PERMISSION_ERROR' } });
    assert.equal(e.code, 'PROMO_PERMISSION_DISABLED');
    assert.equal(e.httpStatus, 403);
    assert.equal(e.providerCode, 1010);
  });

  it('2005 POINT_NOT_ENOUGH → PROMO_AGENT_BALANCE_LOW / 402', () => {
    const e = toPromoError({ status: 200, data: { code: 2005, message: 'POINT_NOT_ENOUGH' } });
    assert.equal(e.code, 'PROMO_AGENT_BALANCE_LOW');
    assert.equal(e.httpStatus, 402);
  });

  it('2011 BONUSCALL_DOUBLE → PROMO_CALL_DUPLICATE / 409', () => {
    const e = toPromoError({ status: 200, data: { code: 2011 } });
    assert.equal(e.code, 'PROMO_CALL_DUPLICATE');
    assert.equal(e.httpStatus, 409);
  });

  it('2012 BONUSCALL_ALEADY_ENDED → PROMO_CALL_ENDED / 409', () => {
    const e = toPromoError({ status: 200, data: { code: 2012 } });
    assert.equal(e.code, 'PROMO_CALL_ENDED');
    assert.equal(e.httpStatus, 409);
  });

  it('2002 USER_NOT_FOUND → PROMO_USER_NOT_FOUND / 404', () => {
    const e = toPromoError({ status: 200, data: { code: 2002 } });
    assert.equal(e.code, 'PROMO_USER_NOT_FOUND');
    assert.equal(e.httpStatus, 404);
  });

  it('2003 GAME_NOT_FOUND → PROMO_GAME_NOT_FOUND / 404', () => {
    const e = toPromoError({ status: 200, data: { code: 2003 } });
    assert.equal(e.code, 'PROMO_GAME_NOT_FOUND');
    assert.equal(e.httpStatus, 404);
  });

  it('1002 VALIDATION_ERROR → PROMO_INVALID_PARAMS / 400', () => {
    const e = toPromoError({ status: 200, data: { code: 1002 } });
    assert.equal(e.code, 'PROMO_INVALID_PARAMS');
    assert.equal(e.httpStatus, 400);
  });

  it('1012 PARAMETERS_INVALID → PROMO_INVALID_PARAMS / 400', () => {
    const e = toPromoError({ status: 200, data: { code: 1012 } });
    assert.equal(e.code, 'PROMO_INVALID_PARAMS');
    assert.equal(e.httpStatus, 400);
  });

  it('1 UNDER_MAINTENANCE → PROMO_PROVIDER_BUSY / 503', () => {
    const e = toPromoError({ status: 200, data: { code: 1 } });
    assert.equal(e.code, 'PROMO_PROVIDER_BUSY');
    assert.equal(e.httpStatus, 503);
  });

  it('1018 SERVER_IS_BUSY → PROMO_PROVIDER_BUSY / 503', () => {
    const e = toPromoError({ status: 200, data: { code: 1018 } });
    assert.equal(e.code, 'PROMO_PROVIDER_BUSY');
    assert.equal(e.httpStatus, 503);
  });

  it('bilinmeyen kod → PROMO_PROVIDER_ERROR / 502', () => {
    const e = toPromoError({ status: 200, data: { code: 9999, message: 'huh' } });
    assert.equal(e.code, 'PROMO_PROVIDER_ERROR');
    assert.equal(e.httpStatus, 502);
  });
});

describe('toPromoError — (b) Error nesnesi, message bir kod adı ya da serbest metin', () => {
  it("Error('PERMISSION_ERROR') → PROMO_PERMISSION_DISABLED", () => {
    const e = toPromoError(new Error('PERMISSION_ERROR'));
    assert.equal(e.code, 'PROMO_PERMISSION_DISABLED');
    assert.equal(e.httpStatus, 403);
  });

  it("Error('BONUSCALL_ALEADY_ENDED') → PROMO_CALL_ENDED", () => {
    const e = toPromoError(new Error('BONUSCALL_ALEADY_ENDED'));
    assert.equal(e.code, 'PROMO_CALL_ENDED');
    assert.equal(e.httpStatus, 409);
  });

  it("Error('fetch failed') (serbest metin) → PROMO_PROVIDER_ERROR / 502", () => {
    const e = toPromoError(new Error('fetch failed'));
    assert.equal(e.code, 'PROMO_PROVIDER_ERROR');
    assert.equal(e.httpStatus, 502);
  });
});

describe('toPromoError — (c) Error nesnesi, message sayısal kod içeriyor', () => {
  it("Error('Igames API error 2005') → PROMO_AGENT_BALANCE_LOW", () => {
    const e = toPromoError(new Error('Igames API error 2005: POINT_NOT_ENOUGH'));
    assert.equal(e.code, 'PROMO_AGENT_BALANCE_LOW');
    assert.equal(e.httpStatus, 402);
  });

  it("Error('1010') → PROMO_PERMISSION_DISABLED", () => {
    const e = toPromoError(new Error('1010'));
    assert.equal(e.code, 'PROMO_PERMISSION_DISABLED');
    assert.equal(e.httpStatus, 403);
  });
});
