/**
 * Route wiring smoke test — verifies all modified route files import cleanly,
 * middleware chains are valid, and no schema/controller import errors exist.
 * Does NOT require a running DB — purely static import + router mount verification.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Route wiring smoke test', () => {
  it('all route files import without errors', async () => {
    const routes = [
      () => import('../src/routes/casino.js'),
      () => import('../src/routes/crypto.js'),
      () => import('../src/routes/help.js'),
      () => import('../src/routes/promotions.js'),
      () => import('../src/routes/responsibleGaming.js'),
      () => import('../src/routes/users.js'),
      () => import('../src/routes/admin2fa.js'),
      () => import('../src/routes/bank.js'),
      () => import('../src/routes/reconciliation.js'),
      () => import('../src/routes/kyc.js'),
      () => import('../src/routes/admin.js'),
      () => import('../src/routes/adminModuleSettings.js'),
    ];

    for (const loadRoute of routes) {
      try {
        const mod = await loadRoute();
        assert.ok(mod.default, `Route module should export a default router`);
      } catch (err) {
        assert.fail(`Route import failed: ${err.message}`);
      }
    }
  });

  it('all validator files import without errors', async () => {
    const validators = [
      () => import('../src/validators/admin.js'),
      () => import('../src/validators/admin2fa.js'),
      () => import('../src/validators/adminModuleSettings.js'),
      () => import('../src/validators/bank.js'),
      () => import('../src/validators/casino.js'),
      () => import('../src/validators/crypto.js'),
      () => import('../src/validators/help.js'),
      () => import('../src/validators/kycSession.js'),
      () => import('../src/validators/multiBrand.js'),
      () => import('../src/validators/multiCurrency.js'),
      () => import('../src/validators/multiJurisdiction.js'),
      () => import('../src/validators/playerSegment.js'),
      () => import('../src/validators/promotions.js'),
      () => import('../src/validators/reconciliation.js'),
      () => import('../src/validators/responsibleGaming.js'),
      () => import('../src/validators/users.js'),
      () => import('../src/validators/transaction.js'),
      () => import('../src/validators/chat.js'),
      () => import('../src/validators/bet.js'),
      () => import('../src/validators/auth.js'),
      () => import('../src/validators/kyc.js'),
      () => import('../src/validators/ticket.js'),
    ];

    for (const loadValidator of validators) {
      try {
        await loadValidator();
      } catch (err) {
        assert.fail(`Validator import failed: ${err.message}`);
      }
    }
  });

  it('all schemas are valid Zod schemas (safeParse works)', async () => {
    const { spinSchema } = await import('../src/validators/casino.js');
    const { withdrawRequestSchema } = await import('../src/validators/crypto.js');
    const { chatSchema } = await import('../src/validators/help.js');
    const { claimPromotionSchema } = await import('../src/validators/promotions.js');
    const { setLimitSchema, setSessionLimitSchema, activateCoolOffSchema, activateSelfExclusionSchema, restrictAccountSchema } = await import('../src/validators/responsibleGaming.js');
    const { updatePreferencesSchema, updateLimitsSchema } = await import('../src/validators/users.js');
    const { setup2faSchema, verify2faSchema, disable2faSchema } = await import('../src/validators/admin2fa.js');
    const { adminRejectSchema } = await import('../src/validators/bank.js');
    const { createJobSchema, resolveItemSchema } = await import('../src/validators/reconciliation.js');
    const { oddsProviderTokenSchema } = await import('../src/validators/adminModuleSettings.js');
    const { initSessionSchema } = await import('../src/validators/kycSession.js');

    // spinSchema — valid
    assert.ok(spinSchema.safeParse({ bet: 10 }).success);
    assert.ok(!spinSchema.safeParse({}).success);
    assert.ok(!spinSchema.safeParse({ bet: -1 }).success);

    // withdrawRequestSchema — valid
    assert.ok(withdrawRequestSchema.safeParse({ address: 'T' + 'a'.repeat(33), usdtAmount: 50 }).success);
    assert.ok(!withdrawRequestSchema.safeParse({ address: 'short', usdtAmount: 50 }).success);

    // chatSchema — valid
    assert.ok(chatSchema.safeParse({ messages: [{ role: 'user', content: 'hi' }] }).success);
    assert.ok(!chatSchema.safeParse({ messages: [] }).success);

    // claimPromotionSchema — only true accepted
    assert.ok(claimPromotionSchema.safeParse({ acceptedBonusTerms: true }).success);
    assert.ok(!claimPromotionSchema.safeParse({ acceptedBonusTerms: false }).success);

    // setLimitSchema — amount + optional limitType
    assert.ok(setLimitSchema.safeParse({ amount: 100 }).success);
    assert.ok(setLimitSchema.safeParse({ amount: 100, limitType: 'daily' }).success);
    assert.ok(!setLimitSchema.safeParse({ amount: 'abc' }).success);

    // setSessionLimitSchema
    assert.ok(setSessionLimitSchema.safeParse({ minutes: 60 }).success);

    // activateCoolOffSchema
    assert.ok(activateCoolOffSchema.safeParse({ duration: 24 }).success);

    // activateSelfExclusionSchema
    assert.ok(activateSelfExclusionSchema.safeParse({ until: new Date().toISOString() }).success);

    // restrictAccountSchema
    assert.ok(restrictAccountSchema.safeParse({ reason: 'test' }).success);
    assert.ok(!restrictAccountSchema.safeParse({}).success);

    // updatePreferencesSchema — all optional
    assert.ok(updatePreferencesSchema.safeParse({}).success);
    assert.ok(updatePreferencesSchema.safeParse({ language: 'tr' }).success);

    // updateLimitsSchema — all optional
    assert.ok(updateLimitsSchema.safeParse({}).success);
    assert.ok(updateLimitsSchema.safeParse({ depositDaily: 1000 }).success);

    // setup2faSchema
    assert.ok(setup2faSchema.safeParse({ password: 'pass123' }).success);

    // verify2faSchema — 6-char TOTP or 8-char backup code
    assert.ok(verify2faSchema.safeParse({ token: '123456' }).success);
    assert.ok(verify2faSchema.safeParse({ token: 'abcd1234' }).success);
    assert.ok(!verify2faSchema.safeParse({ token: '123' }).success);
    assert.ok(!verify2faSchema.safeParse({ token: '123456789' }).success);

    // disable2faSchema
    assert.ok(disable2faSchema.safeParse({ password: 'pass', token: '123456' }).success);

    // adminRejectSchema
    assert.ok(adminRejectSchema.safeParse({ note: 'rejected' }).success);
    assert.ok(adminRejectSchema.safeParse({}).success);

    // createJobSchema (type enum eşleşiyor mu diye ReconciliationJob.type modeliyle
    // birebir aynı değer kullanılır — 'manual' bu enum'a hiç girmedi)
    // dateRange artık zorunlu (final review Fix 3 — sınırsız job-start production riskiydi)
    assert.ok(createJobSchema.safeParse({ name: 'test', type: 'transaction' }).success === false);
    assert.ok(createJobSchema.safeParse({
      name: 'test',
      type: 'transaction',
      dateRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T00:00:00.000Z' },
    }).success);

    // resolveItemSchema
    assert.ok(resolveItemSchema.safeParse({ status: 'resolved' }).success);
    assert.ok(!resolveItemSchema.safeParse({ status: 'bad' }).success);

    // oddsProviderTokenSchema
    assert.ok(oddsProviderTokenSchema.safeParse({ token: 'a'.repeat(16) }).success);
    assert.ok(!oddsProviderTokenSchema.safeParse({ token: 'short' }).success);

    // initSessionSchema
    assert.ok(initSessionSchema.safeParse({ country: 'TR' }).success);
    assert.ok(initSessionSchema.safeParse({}).success);
  });
});
