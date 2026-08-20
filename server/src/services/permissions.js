import Permission from '../models/Permission.js';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { createError } from '../middleware/error.js';

/**
 * Initialize default permissions
 */
export async function initDefaultPermissions() {
  const count = await Permission.countDocuments();
  if (count > 0) return;

  const permissions = [
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
    { key: 'admin:casino:bonus', name: 'Bonus Çağrısı', category: 'casino', description: 'Palace bonus çağrısı başlatma/iptal' },

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
  ];

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

  // Base role check
  if (user.role === 'admin') {
    // Admins have all permissions by default
    return true;
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
    return await Permission.find({}).select('key name category');
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
 */
export async function assignRoleToUser(userId, roleId, adminId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const role = await Role.findById(roleId);
  if (!role) throw new Error('Role not found');

  if (!user.roles.some(r => r.equals(roleId))) {
    user.roles.push(roleId);
    await user.save();
  }

  return user;
}

/**
 * Remove role from user (admin)
 */
export async function removeRoleFromUser(userId, roleId) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  user.roles = user.roles.filter(r => !r.equals(roleId));
  await user.save();

  return user;
}

/**
 * Create custom role (admin)
 */
export async function createRole(data) {
  const { name, displayName, description, permissions = [], priority = 0 } = data;

  if (await Role.findOne({ name })) {
    throw new Error('Role name already exists');
  }

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
export async function updateRole(roleId, updates) {
  const allowedUpdates = ['displayName', 'description', 'permissions', 'priority'];
  const updateData = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedUpdates.includes(k))
  );

  const role = await Role.findByIdAndUpdate(roleId, updateData, { new: true, runValidators: true });
  if (!role) throw new Error('Role not found');

  if (role.isSystem) {
    throw new Error('System roles cannot be modified');
  }

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

  // Remove from all users
  await User.updateMany(
    { roles: roleId },
    { $pull: { roles: roleId } }
  );

  await Role.findByIdAndDelete(roleId);
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
      return next(createError(401, 'UNAUTHORIZED', 'Token gerekli'));
    }

    const hasPermission = await userHasPermission(req.user.id, permissionKey);
    if (!hasPermission) {
      return next(createError(403, 'FORBIDDEN', `Yetki yok: ${permissionKey}`));
    }

    next();
  };
}