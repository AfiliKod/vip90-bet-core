import Permission from '../models/Permission.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';
import { invalidateUserTokens } from '../middleware/auth.js';

export const PERMISSION_DEFS = [
  // Users
  { key: 'admin:users:read', name: 'Kullanıcıları Görüntüle', category: 'users', description: 'Kullanıcı listesi ve detayları' },
  { key: 'admin:users:write', name: 'Kullanıcı Düzenle', category: 'users', description: 'Kullanıcı oluşturma, düzenleme, silme' },
  { key: 'admin:users:balance', name: 'Bakiye Yönetimi', category: 'users', description: 'Kullanıcı bakiyesi artırma/azaltma' },
  { key: 'admin:users:kyc', name: 'KYC Yönetimi', category: 'users', description: 'KYC onay/red' },

  // Roles & Permissions
  { key: 'admin:roles:read', name: 'Rolleri Görüntüle', category: 'roles', description: 'Rol ve izin listesi' },
  { key: 'admin:roles:write', name: 'Rolleri Yönet', category: 'roles', description: 'Rol oluşturma, düzenleme, silme, izin atama' },

  // Settings
  { key: 'admin:settings:read', name: 'Ayarları Görüntüle', category: 'settings', description: 'Sistem ayarlarını görüntüleme' },
  { key: 'admin:settings:write', name: 'Ayarları Düzenle', category: 'settings', description: 'Sistem ayarlarını değiştirme' },

  // Theme
  { key: 'admin:theme:read', name: 'Tema Görüntüle', category: 'theme', description: 'Tema ayarlarını görüntüleme' },
  { key: 'admin:theme:write', name: 'Tema Düzenle', category: 'theme', description: 'Tema token, branding düzenleme' },

  // Casino
  { key: 'admin:casino:read', name: 'Casino Görüntüle', category: 'casino', description: 'Casino istatistikleri, oyunlar' },
  { key: 'admin:casino:write', name: 'Casino Yönet', category: 'casino', description: 'RTP, limitler, oyun ayarları' },
  { key: 'admin:casino:rtp', name: 'RTP Ayarla', category: 'casino', description: 'RTP oranı değiştirme' },
  { key: 'admin:casino:bonus', name: 'Bonus Çağrısı', category: 'casino', description: 'Igames bonus çağrısı başlatma/iptal' },

  // Events/Betting
  { key: 'admin:events:read', name: 'Etkinlikleri Görüntüle', category: 'events', description: 'Etkinlik listesi, arama' },
  { key: 'admin:events:write', name: 'Etkinlik Yönet', category: 'events', description: 'Etkinlik oluşturma, düzenleme, sonuçlandırma' },
  { key: 'admin:events:settle', name: 'Sonuçlandırma', category: 'events', description: 'Etkinlik sonuçlandırma' },

  // Reports/Analytics
  { key: 'admin:reports:read', name: 'Raporları Görüntüle', category: 'reports', description: 'Analitik, istatistikler' },
  { key: 'admin:reports:export', name: 'Rapor Dışa Aktar', category: 'reports', description: 'CSV/Excel dışa aktarma' },

  // Transactions
  { key: 'admin:transactions:read', name: 'İşlemleri Görüntüle', category: 'transactions', description: 'İşlem geçmişi, arama' },
  { key: 'admin:transactions:write', name: 'İşlem Yönet', category: 'transactions', description: 'Manuel işlem oluşturma, düzeltme' },

  // Activity Feed
  { key: 'admin:activity:read', name: 'Aktivite Akışını Görüntüle', category: 'activity', description: 'Canlı site aktivite akışı' },

  { key: 'admin:demo-data:manage', name: 'Demo Veri Yönetimi', category: 'demo-data', description: 'Seed veri yükleme/temizleme, canlı simülasyon kontrolü' },

  // Referral/Affiliate
  { key: 'admin:referral:read', name: 'Affiliate Görüntüle', category: 'referral', description: 'Affiliate ağacı, komisyonlar' },
  { key: 'admin:referral:approve', name: 'Komisyon Onayla', category: 'referral', description: 'Bekleyen komisyonları onaylama/reddetme' },
  { key: 'admin:referral:rates', name: 'Komisyon Oranları', category: 'referral', description: 'Komisyon oranlarını değiştirme' },

  // Agent
  { key: 'admin:agent:read', name: 'Agent Görüntüle', category: 'agent', description: 'Agent listesi, oyuncuları' },
  { key: 'admin:agent:write', name: 'Agent Yönet', category: 'agent', description: 'Agent oluşturma, oyuncu atama, komisyona' },

  // KYC
  { key: 'admin:kyc:read', name: 'KYC Görüntüle', category: 'kyc', description: 'KYC talepleri listesi' },
  { key: 'admin:kyc:approve', name: 'KYC Onayla', category: 'kyc', description: 'KYC onay/red, belge inceleme' },

  // Support/Tickets
  { key: 'admin:support:read', name: 'Destek Görüntüle', category: 'support', description: 'Ticket listesi, detaylar' },
  { key: 'admin:support:write', name: 'Destek Yönet', category: 'support', description: 'Ticket yanıtlama, durum değiştirme' },

  // Audit/Logs
  { key: 'admin:audit:read', name: 'Denetim Görüntüle', category: 'audit', description: 'Admin eylem logları' },

  // Risk/Fraud
  { key: 'admin:risk:read', name: 'Risk Görüntüle', category: 'risk', description: 'Risk profilleri, bulguları, istatistikleri' },
  { key: 'admin:risk:review', name: 'Risk İnceleme', category: 'risk', description: 'Risk bulgularını inceleme, çözme, reddetme' },
  { key: 'admin:risk:write', name: 'Risk Yönet', category: 'risk', description: 'Manuel risk durumu değiştirme' },
  { key: 'admin:risk:rules', name: 'Risk Kuralları', category: 'risk', description: 'Risk kuralları oluşturma, düzenleme, silme' },

  // Bank
  { key: 'admin:bank:read', name: 'Banka İşlemleri Görüntüle', category: 'bank', description: 'Banka talepleri listesi, detaylar' },
  { key: 'admin:bank:write', name: 'Banka İşlemleri Yönet', category: 'bank', description: 'Banka taleplerini onaylama/reddetme' },

  // Responsible Gaming
  { key: 'admin:rg:read', name: 'Sorumlu Oyun Görüntüle', category: 'responsible_gaming', description: 'Oyuncu limitleri, kısıtlamalar' },
  { key: 'admin:rg:manage', name: 'Sorumlu Oyun Yönet', category: 'responsible_gaming', description: 'Hesap kısıtlama, limit değiştirme' },

  // Reconciliation
  { key: 'admin:reconciliation:read', name: 'Mutabakat Görüntüle', category: 'reconciliation', description: 'Mutabakat işleri, kalemler' },
  { key: 'admin:reconciliation:write', name: 'Mutabakat Yönet', category: 'reconciliation', description: 'Mutabakat işi oluşturma, çözme' },

  // Integrations (V5): provider connection settings, API keys, credentials
  { key: 'admin:integrations:read', name: 'Entegrasyonları Görüntüle', category: 'integrations', description: 'Sağlayıcı bağlantı ayarları ve kimlik bilgisi durumu' },
  { key: 'admin:integrations:write', name: 'Entegrasyonları Yönet', category: 'integrations', description: 'Sağlayıcı ayarları, API anahtarı ve kimlik bilgisi değiştirme' },
];

/**
 * Initialize default permissions
 */
export async function initDefaultPermissions() {
  const count = await Permission.countDocuments();
  if (count > 0) return;

  const permissions = PERMISSION_DEFS;

  await Permission.insertMany(permissions);
  return permissions;
}

/**
 * Initialize default roles
 */
export async function initDefaultRoles() {
  const count = await Role.countDocuments();
  if (count > 0) return;

  const permissions = await Permission.find({}).lean();
  const permMap = Object.fromEntries(permissions.map(p => [p.key, p._id]));

  const roles = [
    {
      name: 'super_admin',
      displayName: 'Süper Admin',
      description: 'Tüm sistem yetkileri',
      permissions: permissions.map(p => p._id),
      isSystem: true,
      priority: 100,
    },
    {
      name: 'admin',
      displayName: 'Admin',
      description: 'Genel admin yetkileri (roller hariç)',
      permissions: permissions
        .filter(p => !p.key.startsWith('admin:roles:'))
        .map(p => p._id),
      isSystem: true,
      priority: 90,
    },
    {
      name: 'risk_analyst',
      displayName: 'Risk Analisti',
      description: 'Risk okuma ve inceleme yetkileri',
      permissions: [
        permMap['admin:risk:read'],
        permMap['admin:risk:review'],
        permMap['admin:users:read'],
        permMap['admin:transactions:read'],
        permMap['admin:audit:read'],
      ].filter(Boolean),
      isSystem: true,
      priority: 55,
    },
    {
      name: 'support',
      displayName: 'Destek',
      description: 'Kullanıcı destek ve ticket yönetimi',
      permissions: [
        permMap['admin:users:read'],
        permMap['admin:users:kyc'],
        permMap['admin:transactions:read'],
        permMap['admin:support:read'],
        permMap['admin:support:write'],
        permMap['admin:kyc:read'],
        permMap['admin:kyc:approve'],
      ].filter(Boolean),
      isSystem: true,
      priority: 50,
    },
    {
      name: 'finance',
      displayName: 'Finans',
      description: 'Finansal işlemler, bakiye, komisyonlar',
      permissions: [
        permMap['admin:users:read'],
        permMap['admin:users:balance'],
        permMap['admin:transactions:read'],
        permMap['admin:transactions:write'],
        permMap['admin:referral:read'],
        permMap['admin:referral:approve'],
        permMap['admin:referral:rates'],
        permMap['admin:agent:read'],
        permMap['admin:reports:read'],
        permMap['admin:reports:export'],
      ].filter(Boolean),
      isSystem: true,
      priority: 60,
    },
    {
      name: 'casino_manager',
      displayName: 'Casino Yöneticisi',
      description: 'Casino oyunları, RTP, limitler',
      permissions: [
        permMap['admin:casino:read'],
        permMap['admin:casino:write'],
        permMap['admin:casino:rtp'],
        permMap['admin:casino:bonus'],
        permMap['admin:reports:read'],
      ].filter(Boolean),
      isSystem: true,
      priority: 55,
    },
    {
      name: 'content_manager',
      displayName: 'İçerik Yöneticisi',
      description: 'Tema, branding, sayfa düzenleme',
      permissions: [
        permMap['admin:theme:read'],
        permMap['admin:theme:write'],
        permMap['admin:settings:read'],
      ].filter(Boolean),
      isSystem: true,
      priority: 40,
    },
  ];

  await Role.insertMany(roles);
  return roles;
}

export async function syncMissingPermissions() {
  const existingKeys = new Set((await Permission.find({}, { key: 1 }).lean()).map(p => p.key));
  const missing = PERMISSION_DEFS.filter(p => !existingKeys.has(p.key));
  if (missing.length === 0) return { added: 0 };

  const inserted = await Permission.insertMany(missing);

  const superAdmin = await Role.findOne({ name: 'super_admin' });
  if (superAdmin) {
    superAdmin.permissions.push(...inserted.map(p => p._id));
    await superAdmin.save();
  }
  const admin = await Role.findOne({ name: 'admin' });
  if (admin) {
    const nonRolesPerms = inserted.filter(p => !p.key.startsWith('admin:roles:'));
    admin.permissions.push(...nonRolesPerms.map(p => p._id));
    await admin.save();
  }

  return { added: inserted.length };
}

/**
 * Var olan role='admin' kullanıcılara (roles dizisi boşsa) super_admin
 * rolünü ata.
 *
 * userHasPermission() bilinçli olarak role==='admin' TEK BAŞINA yeterli
 * saymıyor (H1 güvenlik sınırlaması, bkz. o fonksiyondaki yorum) — ayrıca
 * user.roles'te gerçek bir Role dokümanı (super_admin gibi) gerekiyor.
 * Ama initDefaultPermissions/initDefaultRoles yalnızca Permission/Role
 * KOLEKSİYONLARINI dolduruyor, hiçbir User'a Role ATAMIYOR. Granular RBAC
 * bu sistemde SONRADAN eklendiği için, önceden var olan admin hesapları
 * (ör. tek admin kullanıcısı) hiçbir Role'e bağlı kalmadı — sonuç: admin
 * panelindeki neredeyse her granular izin kontrolü "Yetki yok" hatası
 * veriyordu (2026-09-22'de canlı olarak gözlemlendi). İdempotent: zaten
 * bir Role'ü olan kullanıcılara dokunmaz.
 */
export async function migrateOrphanedAdminRoles() {
  const superAdminRole = await Role.findOne({ name: 'super_admin' });
  if (!superAdminRole) return { migrated: 0 };
  // V5: only the legacy bootstrap case (nobody holds super_admin yet) is
  // promoted. Once a super_admin exists, a role-less admin is a stripped
  // account (e.g. its last role was deleted) and must not become super_admin
  // on the next boot; it stays fail-closed (no permissions).
  if (await User.exists({ roles: superAdminRole._id })) return { migrated: 0 };

  const orphaned = await User.find({
    role: 'admin',
    $or: [{ roles: { $exists: false } }, { roles: { $size: 0 } }],
  });

  for (const user of orphaned) {
    await assignRoleToUser(user._id, superAdminRole._id, null);
  }

  if (orphaned.length > 0) {
    console.log(`[permissions] ${orphaned.length} admin kullanıcıya super_admin rolü atandı (eksik atama düzeltmesi)`);
  }
  return { migrated: orphaned.length };
}

/**
 * Check if user has a specific permission
 */
export async function userHasPermission(userId, permissionKey) {
  const user = await User.findById(userId)
    .populate({
      path: 'roles',
      populate: { path: 'permissions' }
    });

  if (!user) return false;

  // SECURITY FIX (H1): Only super_admin gets blanket permission.
  // Regular admin role must check individual role permissions.
  if (user.role === 'admin') {
    const hasSuperAdminRole = (user.roles || []).some(r => r?.name === 'super_admin');
    if (hasSuperAdminRole) return true;
    // Fall through to check individual role permissions below
  }

  // Check additional roles
  for (const role of user.roles || []) {
    if (role.permissions.some(p => p.key === permissionKey)) {
      return true;
    }
  }

  return false;
}

/**
 * Get all permissions for a user (for frontend)
 */
export async function getUserPermissions(userId) {
  const user = await User.findById(userId)
    .populate({
      path: 'roles',
      populate: { path: 'permissions' }
    });

  if (!user) return [];

  if (user.role === 'admin') {
    const hasSuperAdminRole = (user.roles || []).some(r => r?.name === 'super_admin');
    if (hasSuperAdminRole) {
      return await Permission.find({}).select('key name category');
    }
  }

  const permissionKeys = new Set();
  for (const role of user.roles || []) {
    for (const perm of role.permissions || []) {
      permissionKeys.add(perm.key);
    }
  }

  return await Permission.find({ key: { $in: Array.from(permissionKeys) } })
    .select('key name category');
}

/**
 * Assign role to user (admin)
 *
 * Rol atanan kullanıcı admin paneline GİREBİLMELİ: ProtectedRoute
 * `user.role === 'admin'` bekliyor, `assignRoleToUser` ise yalnızca
 * `user.roles` dizisine ekliyordu — sonuç: rolü olan kullanıcı panele hiç
 * giremiyordu (2026-09-30'da canlı akışta doğrulandı).
 *
 * Kapsam yine rollerin izinleriyle sınırlı: `userHasPermission` gerçek rolün
 * izinlerine bakar, super_admin değilse fazlasını vermez. Yani burada
 * yükseltme "panel girişi" açar, "her şeyi yapabilir" değil.
 */
/**
 * role='admin' olup hiç Role'ü olmayan kullanıcıya sistemdeki 'admin' rolünü
 * (roller yönetimi hariç tüm izinler) atar.
 *
 * userHasPermission() role==='admin'i tek başına yeterli saymaz; panelden
 * açılan bir admin `roles: []` ile kalınca /api/admin/activity dahil tüm
 * ayrıntılı izinlerde 403 alıyordu — ta ki sunucu yeniden başlayıp
 * migrateOrphanedAdminRoles() ona (üstelik super_admin) atayana dek.
 * Bilerek super_admin değil: kullanıcı açma yetkisi olan biri, rol yönetimi
 * yetkisi olmadan süper admin üretememeli.
 */
/**
 * V21: permission keys the actor holds, loaded once. `null` = super_admin
 * (holds everything).
 */
async function loadActorPermissionKeys(actorId) {
  const user = await User.findById(actorId).populate({ path: 'roles', populate: { path: 'permissions' } });
  if (!user) return new Set();
  const roles = user.roles || [];
  if (user.role === 'admin' && roles.some((r) => r?.name === 'super_admin')) return null;
  const keys = new Set();
  for (const r of roles) for (const p of r?.permissions || []) keys.add(p.key);
  return keys;
}

const SUBSET_MESSAGES = {
  grant: 'Yetkiniz olmayan izin atanamaz',
  delete: 'Yetkiniz olmayan izin içeren rol silinemez',
  update: 'Yetkiniz olmayan izin içeren rol değiştirilemez',
};

function assertSubset(held, keys, action = 'grant') {
  if (held === null) return;
  for (const k of keys) {
    if (!held.has(k)) {
      throw createError(403, 'ROLE_GRANT_FORBIDDEN', `${SUBSET_MESSAGES[action] || SUBSET_MESSAGES.grant}: ${k}`);
    }
  }
}

/**
 * V21: every permission in `permissionIds` must be held by the actor.
 */
export async function assertCanGrantPermissions(actorId, permissionIds) {
  const ids = [...new Set((permissionIds || []).map(String))];
  const perms = ids.length ? await Permission.find({ _id: { $in: ids } }).select('key') : [];
  if (perms.length !== ids.length) throw createError(400, 'PERMISSION_NOT_FOUND', 'Geçersiz izin');
  assertSubset(await loadActorPermissionKeys(actorId), perms.map((p) => p.key));
}

/**
 * V21: a role may only be granted by an actor who already holds every
 * permission in it (super_admin passes).
 */
export async function assertCanGrantRole(actorId, roleId, action = 'grant') {
  const role = await Role.findById(roleId).populate('permissions');
  if (!role) throw createError(404, 'ROLE_NOT_FOUND', 'Rol bulunamadı');
  assertSubset(await loadActorPermissionKeys(actorId), (role.permissions || []).map((p) => p.key), action);
}

/**
 * V5 (I3): a staff target (role 'admin' or any Role) may only be modified by
 * an actor who holds every permission the target holds; a super_admin target
 * therefore needs a super_admin actor. Players pass.
 */
export async function assertCanManageUser(actorId, targetId) {
  const target = await User.findById(targetId).select('role roles').lean();
  if (!target) return;
  if (target.role !== 'admin' && !(target.roles || []).length) return;
  if (String(actorId) === String(targetId)) return;
  const held = await loadActorPermissionKeys(actorId);
  if (held === null) return;
  const targetKeys = await loadActorPermissionKeys(targetId);
  const deny = () => createError(403, 'STAFF_MANAGE_FORBIDDEN', 'Bu yönetici hesabını değiştirmek için onun tüm yetkilerine sahip olmalısınız');
  if (targetKeys === null) throw deny();
  for (const k of targetKeys) if (!held.has(k)) throw deny();
}

/**
 * V5 (I3): refuse a change that would leave no active super_admin.
 * `change` is 'deactivate' or { removeRoleId }.
 */
export async function assertKeepsActiveSuperAdmin(targetId, change) {
  const sup = await Role.findOne({ name: 'super_admin' }).select('_id').lean();
  if (!sup) return;
  if (change?.removeRoleId && String(change.removeRoleId) !== String(sup._id)) return;
  const active = { role: 'admin', roles: sup._id, isActive: { $ne: false }, deletedAt: null };
  if (!(await User.exists({ _id: targetId, ...active }))) return;
  const others = await User.countDocuments({ _id: { $ne: targetId }, ...active });
  if (others === 0) throw createError(409, 'LAST_SUPER_ADMIN', 'Son aktif süper admin devre dışı bırakılamaz veya rolü alınamaz');
}

/**
 * V5: post-write half of the last-super_admin guard. The pre-check above can
 * race between two super_admins; after the write, if no active super_admin is
 * left, `revert` undoes the change and 409 is thrown (before tokens are revoked).
 */
export async function ensureActiveSuperAdminRemains(revert) {
  const sup = await Role.findOne({ name: 'super_admin' }).select('_id').lean();
  if (!sup) return;
  const left = await User.countDocuments({ role: 'admin', roles: sup._id, isActive: { $ne: false }, deletedAt: null });
  if (left > 0) return;
  await revert();
  throw createError(409, 'LAST_SUPER_ADMIN', 'Son aktif süper admin devre dışı bırakılamaz veya rolü alınamaz');
}

export async function assignDefaultAdminRole(userId, actorId = null) {
  const adminRole = await Role.findOne({ name: 'admin' });
  if (!adminRole) return null;
  const user = await User.findById(userId).select('role roles');
  if (!user || user.role !== 'admin' || (user.roles || []).length > 0) return null;
  if (actorId) await assertCanGrantRole(actorId, adminRole._id);
  return assignRoleToUser(userId, adminRole._id, actorId);
}

export async function assignRoleToUser(userId, roleId, adminId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const role = await Role.findById(roleId);
  if (!role) throw new Error('Role not found');

  if (!user.roles.some(r => r.equals(roleId))) {
    user.roles.push(roleId);
    if (user.role !== 'admin') user.role = 'admin';
    await user.save();
    // Invalidate JWT — role change must take effect within 30s
    await invalidateUserTokens(userId);
  }

  return user;
}

/**
 * Remove role from user (admin)
 */
export async function removeRoleFromUser(userId, roleId, { afterWrite } = {}) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  const prevRole = user.role;
  const hadRole = user.roles.some((r) => r.equals(roleId));

  user.roles = user.roles.filter(r => !r.equals(roleId));
  // Son rol de alındıysa kullanıcı artık panel girişi için `role: 'admin'`
  // taşımamalı. userHasPermission zaten roles boşken hiçbir şey vermez
  // (fail-closed), ama panelde "admin" görünürken hiçbir şey yapamamak
  // kafa karıştırıcı — tutarlı davranış: kullanıcıya geri dön.
  if (user.roles.length === 0 && user.role === 'admin') {
    user.role = 'user';
  }
  await user.save();
  // V5: post-write check (e.g. last active super_admin) runs before tokens
  // are revoked; it gets a revert that restores the removed role.
  if (afterWrite) {
    await afterWrite(async () => {
      if (hadRole) await User.updateOne({ _id: userId }, { $addToSet: { roles: roleId }, $set: { role: prevRole } });
    });
  }
  // Invalidate JWT — role change must take effect within 30s
  await invalidateUserTokens(userId);

  return user;
}

/**
 * Create custom role (admin)
 */
export async function createRole(data, actorId = null) {
  const { name, displayName, description, permissions = [], priority = 0 } = data;

  if (await Role.findOne({ name })) {
    throw new Error('Role name already exists');
  }
  if (actorId) await assertCanGrantPermissions(actorId, permissions);

  const role = await Role.create({
    name,
    displayName,
    description,
    permissions,
    isSystem: false,
    priority,
  });

  return role;
}

/**
 * Update role (admin)
 */
export async function updateRole(roleId, updates, actorId = null) {
  const allowedUpdates = ['displayName', 'description', 'permissions', 'priority'];
  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedUpdates.includes(k))
  );

  // V21: refuse system roles and unauthorized permission lists BEFORE any write.
  const existing = await Role.findById(roleId);
  if (!existing) throw new Error('Role not found');
  if (existing.isSystem) throw new Error('System roles cannot be modified');
  if (actorId && updateData.permissions) {
    // V5: changing a role's permission list also needs every permission it
    // holds now — otherwise an actor could strip holders of what they lack.
    await assertCanGrantRole(actorId, roleId, 'update');
    await assertCanGrantPermissions(actorId, updateData.permissions);
  }

  const role = await Role.findOneAndUpdate(
    { _id: roleId, isSystem: { $ne: true } }, updateData, { new: true, runValidators: true });
  if (!role) throw new Error('System roles cannot be modified');

  return role;
}

/**
 * Delete role (admin) - only non-system roles
 */
export async function deleteRole(roleId) {
  const role = await Role.findById(roleId);
  if (!role) throw new Error('Role not found');

  if (role.isSystem) {
    throw new Error('System roles cannot be deleted');
  }

  // Remove from all users. V5: like removeRoleFromUser, a holder left with no
  // role drops back to role 'user' — otherwise migrateOrphanedAdminRoles()
  // would treat it as an orphaned admin — and every holder's tokens are revoked.
  const holders = (await User.find({ roles: roleId }).select('_id').lean()).map((u) => u._id);
  await User.updateMany(
    { roles: roleId },
    { $pull: { roles: roleId } }
  );
  if (holders.length) {
    await User.updateMany(
      { _id: { $in: holders }, role: 'admin', roles: { $size: 0 } },
      { $set: { role: 'user' } }
    );
  }

  await Role.findByIdAndDelete(roleId);
  for (const id of holders) await invalidateUserTokens(id);
  return true;
}

/**
 * Get all roles (admin)
 */
export async function getAllRoles() {
  return Role.find({}).populate('permissions', 'key name category').sort({ priority: -1 });
}

/**
 * Get all permissions (admin)
 */
export async function getAllPermissions() {
  return Permission.find({}).sort({ category: 1, key: 1 });
}

/**
 * Express middleware factory for permission checking
 */
export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    if (!req.user) {
      // req.user burada boşsa ya requireAuth zaten reddetmiştir (o zaman
      // middleware/auth.js kendi log satırını basar) ya da requireAuth bu
      // istek için HİÇ ÇALIŞMAMIŞTIR — o ihtimali ayırt etmek için ayrı log.
      console.warn(`[requirePermission] req.user boş (requireAuth hiç set etmemiş olabilir) — ${req.method} ${req.originalUrl}, permission=${permissionKey}`);
      return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
    }

    const hasPermission = await userHasPermission(req.user.id, permissionKey);
    if (!hasPermission) {
      return next(createError(403, 'FORBIDDEN', `Yetki yok: ${permissionKey}`));
    }

    next();
  };
}