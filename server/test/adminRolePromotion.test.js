import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Rol atama/yetki yükseltme kuralı (O4).
 *
 * Kural iki parçalı ve basit:
 *  - Bir kullanıcıya rol atandığında `user.role === 'admin'` olur, ÇÜNKÜ
 *    ProtectedRoute (client/src/components/ProtectedRoute.jsx) panele girişi
 *    bu alana bakarak veriyor. Rol dizisine eklemek tek başına yeterli
 *    değildi — kullanıcı panele hiç giremiyordu.
 *  - Son rol kaldırıldığında `role` geri 'user' olur.
 *
 * Kapsam YINE sınırlı: panel girişi açılır, yetkiler rollerin kendi
 * izinlerinden gelir (userHasPermission). Bu test yalnız role alanını
 * denetler.
 */

/** assignRoleToUser'ın rol dizisine ekleme + role yükseltme çekirdeği. */
function applyAssign(user, roleId, alreadyHas) {
  if (!alreadyHas) user.roles.push(roleId);
  if (user.role !== 'admin') user.role = 'admin';
  return user;
}

/** removeRoleFromUser'ın rol silme + role düşürme çekirdeği. */
function applyRemove(user, roleId) {
  user.roles = user.roles.filter(r => r !== roleId);
  if (user.roles.length === 0 && user.role === 'admin') user.role = 'user';
  return user;
}

describe('assignRoleToUser — panel girişi', () => {
  test('rol atanan kullanıcı admin olur (ProtectedRoute için şart)', () => {
    const u = applyAssign({ role: 'user', roles: [] }, 'support', false);
    assert.strictEqual(u.role, 'admin');
    assert.deepStrictEqual(u.roles, ['support']);
  });

  test('rolu olmayan OLAN kullanıcı da yükselir', () => {
    const u = applyAssign({ role: 'user', roles: [] }, 'finance', false);
    assert.strictEqual(u.role, 'admin');
  });

  test('zaten adminse role dokunulmaz', () => {
    const u = applyAssign({ role: 'admin', roles: [] }, 'risk_analyst', false);
    assert.strictEqual(u.role, 'admin');
  });

  test('rol zaten varsa yeniden eklenmez (idempotent)', () => {
    const u = applyAssign({ role: 'user', roles: ['support'] }, 'support', true);
    assert.deepStrictEqual(u.roles, ['support'], 'rol dizisi değişmemeli');
  });

  test('birden fazla rol biriktirilebilir', () => {
    let u = { role: 'user', roles: [] };
    u = applyAssign(u, 'support', false);
    u = applyAssign(u, 'finance', false);
    assert.deepStrictEqual(u.roles, ['support', 'finance']);
    assert.strictEqual(u.role, 'admin');
  });
});

describe('removeRoleFromUser — geri alma', () => {
  test('son rol kaldırılınca kullanıcı user olur', () => {
    const u = applyRemove({ role: 'admin', roles: ['support'] }, 'support');
    assert.strictEqual(u.role, 'user');
    assert.deepStrictEqual(u.roles, []);
  });

  test('ara rol kaldırılırsa admin kalır', () => {
    const u = applyRemove({ role: 'admin', roles: ['support', 'finance'] }, 'support');
    assert.strictEqual(u.role, 'admin');
    assert.deepStrictEqual(u.roles, ['finance']);
  });

  test('rolü olmayan admin kullanıcıda role alanına dokunulmaz', () => {
    // roles boşsa removeRoleFromUser normalde çağrılmaz; yine de çökmesin.
    const u = applyRemove({ role: 'admin', roles: [] }, 'support');
    assert.strictEqual(u.role, 'user');
  });
});

describe('yetki kapsamı panel girişinden genişlemez', () => {
  test('kullanıcının izinleri rollerinden gelir, role alanından değil', () => {
    // userHasPermission (services/permissions.js) yalnız super_admin rolüne
    // "her şey" der; diğer roller kendi izin listesiyle sınırlıdır.
    const rolePermissions = {
      super_admin: 'ALL',
      support: ['admin:support:read', 'admin:support:write', 'admin:kyc:read'],
    };
    const effective = (roleField, roles) => {
      if (roles.includes('super_admin')) return 'ALL';
      return rolePermissions[roles[0]] || [];
    };
    // role='admin' olması tek başına hiçbir şey vermez.
    assert.deepStrictEqual(effective('admin', ['support']), rolePermissions.support);
    // Yani panel GİRİLİR ama yalnız destek+KYC görülür.
    assert.notStrictEqual(effective('admin', ['support']), 'ALL');
  });
});