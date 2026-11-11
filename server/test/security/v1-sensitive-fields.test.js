import { it } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../src/models/User.js';

it('toSafeObject hassas alanları döndürmez', () => {
  const u = new User({ username: 'u1', email: 'u1@example.com', password: 'x',
    twoFactorSecret: 'S', twoFactorBackupCodes: '[]',
    emailVerificationToken: 't', passwordResetToken: 'p' });
  const safe = u.toSafeObject();
  for (const k of ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'emailVerificationToken', 'passwordResetToken']) {
    assert.equal(k in safe, false, k);
  }
});

it('hassas alanlar şemada select:false', () => {
  for (const k of ['password', 'twoFactorSecret', 'twoFactorBackupCodes', 'emailVerificationToken', 'passwordResetToken']) {
    assert.equal(User.schema.path(k).options.select, false, k);
  }
});
