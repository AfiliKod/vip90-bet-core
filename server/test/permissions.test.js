import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Permission from '../src/models/Permission.js';
import Role from '../src/models/Role.js';
import { initDefaultPermissions, initDefaultRoles, userHasPermission, getUserPermissions, assignRoleToUser, removeRoleFromUser, createRole, updateRole, deleteRole, getAllRoles, getAllPermissions } from '../src/services/permissions.js';

describe('Permissions System', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_permissions');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Permission.deleteMany({});
    await Role.deleteMany({});
  });

  describe('initDefaultPermissions', () => {
    it('should create all default permissions', async () => {
      await initDefaultPermissions();
      const count = await Permission.countDocuments();
      assert.ok(count >= 30); // At least 30 permissions
    });

    it('should not create duplicates on second call', async () => {
      await initDefaultPermissions();
      const count1 = await Permission.countDocuments();
      await initDefaultPermissions();
      const count2 = await Permission.countDocuments();
      assert.equal(count1, count2);
    });

    it('should have permissions in correct categories', async () => {
      await initDefaultPermissions();
      const categories = await Permission.distinct('category');
      assert.ok(categories.includes('users'));
      assert.ok(categories.includes('roles'));
      assert.ok(categories.includes('casino'));
      // Categories are: users, roles, settings, theme, casino, events, reports, transactions, referral, agent, kyc, support, audit
      assert.ok(categories.includes('referral'));
      assert.ok(categories.includes('agent'));
    });
  });

  describe('initDefaultRoles', () => {
    it('should create default roles with permissions', async () => {
      await initDefaultPermissions();
      const roles = await initDefaultRoles();
      assert.ok(roles.length >= 5);
    });

    it('should assign permissions to super_admin', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();
      const superAdmin = await Role.findOne({ name: 'super_admin' }).populate('permissions');
      assert.ok(superAdmin.permissions.length > 20);
    });

    it('should not create duplicates on second call', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();
      const count1 = await Role.countDocuments();
      await initDefaultRoles();
      const count2 = await Role.countDocuments();
      assert.equal(count1, count2);
    });
  });

  describe('userHasPermission', () => {
    it('should return true for admin role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const hasPerm = await userHasPermission(user._id, 'admin:users:read');
      assert.equal(hasPerm, true);
    });

    it('should return false for user role without additional roles', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'regular',
        email: 'regular@example.com',
        password: 'password123',
        role: 'user',
      });

      const hasPerm = await userHasPermission(user._id, 'admin:users:read');
      assert.equal(hasPerm, false);
    });

    it('should return true for user with assigned role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'support_user',
        email: 'support@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      user.roles = [supportRole._id];
      await user.save();

      const hasPerm = await userHasPermission(user._id, 'admin:users:read');
      assert.equal(hasPerm, true);
    });

    it('should return false for permission not in role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'support_user',
        email: 'support@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      user.roles = [supportRole._id];
      await user.save();

      // Support role doesn't have admin:roles:write
      const hasPerm = await userHasPermission(user._id, 'admin:roles:write');
      assert.equal(hasPerm, false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return all permissions for admin', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const perms = await getUserPermissions(user._id);
      assert.ok(perms.length >= 30);
    });

    it('should return only role permissions for regular user', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'support_user',
        email: 'support@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      user.roles = [supportRole._id];
      await user.save();

      const perms = await getUserPermissions(user._id);
      // Support has limited permissions
      assert.ok(perms.length > 0);
      assert.ok(perms.length < 30);
      assert.ok(perms.some(p => p.key === 'admin:users:read'));
      assert.ok(!perms.some(p => p.key === 'admin:roles:write'));
    });
  });

  describe('assignRoleToUser', () => {
    it('should assign role to user', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      const updatedUser = await assignRoleToUser(user._id, supportRole._id);

      assert.ok(updatedUser.roles.some(r => r.equals(supportRole._id)));
    });

    it('should not duplicate role assignment', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      await assignRoleToUser(user._id, supportRole._id);
      await assignRoleToUser(user._id, supportRole._id); // Duplicate

      const updatedUser = await User.findById(user._id);
      const roleCount = updatedUser.roles.filter(r => r.equals(supportRole._id)).length;
      assert.equal(roleCount, 1);
    });
  });

  describe('removeRoleFromUser', () => {
    it('should remove role from user', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
      });

      const supportRole = await Role.findOne({ name: 'support' });
      await assignRoleToUser(user._id, supportRole._id);
      await removeRoleFromUser(user._id, supportRole._id);

      const updatedUser = await User.findById(user._id);
      assert.ok(!updatedUser.roles.some(r => r.equals(supportRole._id)));
    });
  });

  describe('createRole', () => {
    it('should create custom role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const perm = await Permission.findOne({ key: 'admin:users:read' });
      const role = await createRole({
        name: 'custom_role',
        displayName: 'Custom Role',
        description: 'Test custom role',
        permissions: [perm._id],
        priority: 10,
      });

      assert.equal(role.name, 'custom_role');
      assert.equal(role.displayName, 'Custom Role');
      assert.equal(role.priority, 10);
      assert.equal(role.isSystem, false);
      assert.equal(role.permissions.length, 1);
    });

    it('should throw error for duplicate role name', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      try {
        await createRole({
          name: 'support', // Already exists
          displayName: 'Duplicate',
        });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already exists'));
      }
    });
  });

  describe('updateRole', () => {
    it('should update custom role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const role = await createRole({
        name: 'custom_role',
        displayName: 'Custom Role',
        priority: 10,
      });

      const updated = await updateRole(role._id, { displayName: 'Updated Role', priority: 20 });
      assert.equal(updated.displayName, 'Updated Role');
      assert.equal(updated.priority, 20);
    });

    it('should throw error for updating system role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const superAdmin = await Role.findOne({ name: 'super_admin' });
      try {
        await updateRole(superAdmin._id, { displayName: 'Hacked' });
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('System roles cannot be modified'));
      }
    });
  });

  describe('deleteRole', () => {
    it('should delete custom role and remove from users', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const perm = await Permission.findOne({ key: 'admin:users:read' });
      const role = await createRole({
        name: 'custom_role',
        displayName: 'Custom Role',
        permissions: [perm._id],
      });

      const user = await User.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        role: 'user',
        roles: [role._id],
      });

      await deleteRole(role._id);

      const deletedRole = await Role.findById(role._id);
      assert.equal(deletedRole, null);

      const updatedUser = await User.findById(user._id);
      assert.ok(!updatedUser.roles.some(r => r.equals(role._id)));
    });

    it('should throw error for deleting system role', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const superAdmin = await Role.findOne({ name: 'super_admin' });
      try {
        await deleteRole(superAdmin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('System roles cannot be deleted'));
      }
    });
  });

  describe('getAllRoles', () => {
    it('should return all roles sorted by priority', async () => {
      await initDefaultPermissions();
      await initDefaultRoles();

      const roles = await getAllRoles();
      assert.ok(roles.length >= 5);
      // Should be sorted by priority descending
      for (let i = 1; i < roles.length; i++) {
        assert.ok(roles[i-1].priority >= roles[i].priority);
      }
    });
  });

  describe('getAllPermissions', () => {
    it('should return all permissions sorted by category', async () => {
      await initDefaultPermissions();

      const perms = await getAllPermissions();
      assert.ok(perms.length >= 30);

      // Check sorting by category
      for (let i = 1; i < perms.length; i++) {
        assert.ok(perms[i-1].category <= perms[i].category);
      }
    });
  });
});