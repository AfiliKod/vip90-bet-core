import { test, describe } from 'node:test';
import assert from 'node:assert';
import { mergeUpdatedUser, findSelectedInResults } from './usersLogic.js';

describe('usersLogic', () => {
  const ahmet = { _id: 'a1', username: 'ahmet', isActive: true, roles: ['r'] };
  const ahmet1907 = { _id: 'a2', username: 'ahmet1907' };

  test('mergeUpdatedUser: PATCH kullanıcısı seçiliyle birleşir, liste alanları korunur', () => {
    const out = mergeUpdatedUser(ahmet, { _id: 'a1', username: 'ahmet', isActive: false });
    assert.deepStrictEqual(out, { _id: 'a1', username: 'ahmet', isActive: false, roles: ['r'] });
  });

  test('mergeUpdatedUser: farklı _id ya da boş yanıt null döner', () => {
    assert.strictEqual(mergeUpdatedUser(ahmet, ahmet1907), null);
    assert.strictEqual(mergeUpdatedUser(ahmet, undefined), null);
  });

  test('findSelectedInResults: benzer adlı yeni hesap seçili kullanıcının yerine geçmez', () => {
    assert.strictEqual(findSelectedInResults([ahmet1907, ahmet], ahmet), ahmet);
  });

  test('findSelectedInResults: _id yoksa tam kullanıcı adı; hiçbiri yoksa null', () => {
    assert.strictEqual(findSelectedInResults([ahmet1907, { _id: 'x', username: 'ahmet' }], ahmet).username, 'ahmet');
    assert.strictEqual(findSelectedInResults([ahmet1907], ahmet), null);
    assert.strictEqual(findSelectedInResults(undefined, ahmet), null);
  });
});
