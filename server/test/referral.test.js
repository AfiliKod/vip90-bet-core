import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ReferralTree from '../src/models/ReferralTree.js';
import ReferralCommission from '../src/models/ReferralCommission.js';
import Transaction from '../src/models/Transaction.js';
import { buildReferralTree, createPendingCommissions, approveCommission, rejectCommission, getReferralTree, getPendingCommissions, getCommissionStats, updateCommissionRates, detectFraud, COMMISSION_RATES } from '../src/services/referral.js';

describe('Referral System', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test');
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await ReferralTree.deleteMany({});
    await ReferralCommission.deleteMany({});
    await Transaction.deleteMany({});
  });

  describe('buildReferralTree', () => {
    it('should create referral tree for referrer and add level 1 referral', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      await buildReferralTree(newUser._id, referrer._id);

      const tree = await ReferralTree.findOne({ userId: referrer._id });
      assert.ok(tree);
      assert.equal(tree.level1.length, 1);
      assert.ok(tree.level1[0].equals(newUser._id));
      assert.equal(tree.totalDirectReferrals, 1);
    });

    it('should create level 2 referral when referrer has a referrer', async () => {
      const level2 = await User.create({
        username: 'level2',
        email: 'level2@example.com',
        password: 'password123',
      });

      const level1 = await User.create({
        username: 'level1',
        email: 'level1@example.com',
        password: 'password123',
        referredBy: level2._id,
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        referredBy: level1._id,
      });

      await buildReferralTree(newUser._id, level1._id);

      const level1Tree = await ReferralTree.findOne({ userId: level1._id });
      assert.equal(level1Tree.level1.length, 1);
      assert.ok(level1Tree.level1[0].equals(newUser._id));

      const level2Tree = await ReferralTree.findOne({ userId: level2._id });
      assert.ok(level2Tree);
      assert.equal(level2Tree.level2.length, 1);
      assert.ok(level2Tree.level2[0].equals(newUser._id));
      assert.equal(level2Tree.totalLevel2Referrals, 1);
    });

    it('should create level 3 referral when chain is 3 deep', async () => {
      const level3 = await User.create({
        username: 'level3',
        email: 'level3@example.com',
        password: 'password123',
      });

      const level2 = await User.create({
        username: 'level2',
        email: 'level2@example.com',
        password: 'password123',
        referredBy: level3._id,
      });

      const level1 = await User.create({
        username: 'level1',
        email: 'level1@example.com',
        password: 'password123',
        referredBy: level2._id,
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        referredBy: level1._id,
      });

      await buildReferralTree(newUser._id, level1._id);

      const level3Tree = await ReferralTree.findOne({ userId: level3._id });
      assert.ok(level3Tree);
      assert.equal(level3Tree.level3.length, 1);
      assert.ok(level3Tree.level3[0].equals(newUser._id));
      assert.equal(level3Tree.totalLevel3Referrals, 1);
    });

    it('should not add duplicate referrals', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      await buildReferralTree(newUser._id, referrer._id);
      await buildReferralTree(newUser._id, referrer._id); // Duplicate

      const tree = await ReferralTree.findOne({ userId: referrer._id });
      assert.equal(tree.level1.length, 1);
      assert.equal(tree.totalDirectReferrals, 1);
    });
  });

  describe('createPendingCommissions', () => {
    it('should create level 1 pending commission', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);

      assert.equal(commissions.length, 1);
      assert.equal(commissions[0].referrerId.toString(), referrer._id.toString());
      assert.equal(commissions[0].level, 1);
      assert.equal(commissions[0].commissionAmount, 10); // 10% of 100
      assert.equal(commissions[0].commissionRate, 10);
      assert.equal(commissions[0].status, 'pending');
      assert.equal(commissions[0].source, 'sports');
    });

    it('should create level 1 and level 2 pending commissions', async () => {
      const level2 = await User.create({
        username: 'level2',
        email: 'level2@example.com',
        password: 'password123',
      });

      const level1 = await User.create({
        username: 'level1',
        email: 'level1@example.com',
        password: 'password123',
        referredBy: level2._id,
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: level1._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'casino', null);

      assert.equal(commissions.length, 2);

      const c1 = commissions.find(c => c.level === 1);
      assert.ok(c1);
      assert.equal(c1.referrerId.toString(), level1._id.toString());
      assert.equal(c1.commissionAmount, 10); // 10%

      const c2 = commissions.find(c => c.level === 2);
      assert.ok(c2);
      assert.equal(c2.referrerId.toString(), level2._id.toString());
      assert.equal(c2.commissionAmount, 5); // 5%
    });

    it('should create all 3 levels of pending commissions', async () => {
      const level3 = await User.create({
        username: 'level3',
        email: 'level3@example.com',
        password: 'password123',
      });

      const level2 = await User.create({
        username: 'level2',
        email: 'level2@example.com',
        password: 'password123',
        referredBy: level3._id,
      });

      const level1 = await User.create({
        username: 'level1',
        email: 'level1@example.com',
        password: 'password123',
        referredBy: level2._id,
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: level1._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'palace', null);

      assert.equal(commissions.length, 3);

      const c1 = commissions.find(c => c.level === 1);
      assert.equal(c1.commissionAmount, 10); // 10%

      const c2 = commissions.find(c => c.level === 2);
      assert.equal(c2.commissionAmount, 5); // 5%

      const c3 = commissions.find(c => c.level === 3);
      assert.equal(c3.commissionAmount, 2); // 2%
    });

    it('should return empty array when bettor has no referrer', async () => {
      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);
      assert.equal(commissions.length, 0);
    });

    it('should return empty array when houseProfit is 0', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 0, 'sports', null);
      assert.equal(commissions.length, 0);
    });
  });

  describe('approveCommission', () => {
    it('should approve pending commission and update referrer balance', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);
      const commission = commissions[0];

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const result = await approveCommission(commission._id, admin._id);

      assert.equal(result.commission.status, 'approved');
      assert.equal(result.commission.approvedBy.toString(), admin._id.toString());
      assert.ok(result.commission.approvedAt);
      assert.ok(result.commission.transactionId);

      const updatedReferrer = await User.findById(referrer._id);
      assert.equal(updatedReferrer.balance, 10);
      assert.equal(updatedReferrer.totalReferralEarnings, 10);

      const tx = await Transaction.findById(result.commission.transactionId);
      assert.ok(tx);
      assert.equal(tx.type, 'referral_commission');
      assert.equal(tx.amount, 10);
      assert.equal(tx.balanceBefore, 0);
      assert.equal(tx.balanceAfter, 10);
    });

    it('should throw error for already approved commission', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);
      const commission = commissions[0];

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      await approveCommission(commission._id, admin._id);

      try {
        await approveCommission(commission._id, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already processed'));
      }
    });

    it('should throw error for non-existent commission', async () => {
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await approveCommission(new mongoose.Types.ObjectId(), admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('not found'));
      }
    });
  });

  describe('rejectCommission', () => {
    it('should reject pending commission', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);
      const commission = commissions[0];

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      const rejected = await rejectCommission(commission._id, admin._id, 'Fraud detected');

      assert.equal(rejected.status, 'rejected');
      assert.equal(rejected.rejectedBy.toString(), admin._id.toString());
      assert.ok(rejected.rejectedAt);
      assert.equal(rejected.rejectionReason, 'Fraud detected');

      // Referrer balance should not change
      const updatedReferrer = await User.findById(referrer._id);
      assert.equal(updatedReferrer.balance, 0);
    });
  });

  describe('getReferralTree', () => {
    it('should return populated referral tree', async () => {
      const level2 = await User.create({
        username: 'level2',
        email: 'level2@example.com',
        password: 'password123',
      });

      const level1 = await User.create({
        username: 'level1',
        email: 'level1@example.com',
        password: 'password123',
        referredBy: level2._id,
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: level1._id,
      });

      await buildReferralTree(bettor._id, level1._id);

      const tree = await getReferralTree(level2._id);

      assert.ok(tree);
      assert.equal(tree.level2.length, 1);
      assert.equal(tree.level2[0].username, 'bettor');
      assert.equal(tree.totalLevel2Referrals, 1);
    });

    it('should return null for user without tree', async () => {
      const user = await User.create({
        username: 'user',
        email: 'user@example.com',
        password: 'password123',
      });

      const tree = await getReferralTree(user._id);
      assert.equal(tree, null);
    });
  });

  describe('getPendingCommissions', () => {
    it('should return pending commissions for referrer', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      await createPendingCommissions(bettor._id, 100, 'sports', null);

      const result = await getPendingCommissions(referrer._id);

      assert.equal(result.commissions.length, 1);
      assert.equal(result.commissions[0].referrerId.username, 'referrer');
      assert.equal(result.total, 1);
    });

    it('should filter by status', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      const commissions = await createPendingCommissions(bettor._id, 100, 'sports', null);
      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      await approveCommission(commissions[0]._id, admin._id);

      const pending = await getPendingCommissions(referrer._id, { status: 'pending' });
      assert.equal(pending.commissions.length, 0);

      const approved = await getPendingCommissions(referrer._id, { status: 'approved' });
      assert.equal(approved.commissions.length, 1);
    });
  });

  describe('getCommissionStats', () => {
    it('should return commission stats breakdown', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      const bettor = await User.create({
        username: 'bettor',
        email: 'bettor@example.com',
        password: 'password123',
        referredBy: referrer._id,
      });

      await createPendingCommissions(bettor._id, 100, 'sports', null);

      const stats = await getCommissionStats(referrer._id);

      assert.equal(stats.pending.count, 1);
      assert.equal(stats.pending.total, 10);
      assert.equal(stats.approved.count, 0);
      assert.equal(stats.rejected.count, 0);
    });
  });

  describe('updateCommissionRates', () => {
    it('should update commission rates for a user', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
      });

      await ReferralTree.create([{
        userId: referrer._id,
        level1: [],
        level2: [],
        level3: [],
      }]);

      const tree = await updateCommissionRates(referrer._id, { level1: 15, level2: 7, level3: 3 });

      assert.equal(tree.commissionRates.level1, 15);
      assert.equal(tree.commissionRates.level2, 7);
      assert.equal(tree.commissionRates.level3, 3);
    });
  });

  describe('detectFraud', () => {
    it('should detect circular referral', async () => {
      const userA = await User.create({
        username: 'usera',
        email: 'usera@example.com',
        password: 'password123',
      });

      const userB = await User.create({
        username: 'userb',
        email: 'userb@example.com',
        password: 'password123',
        referredBy: userA._id,
      });

      // Try to make A refer B (circular)
      const result = await detectFraud(userA._id, userB._id);

      assert.ok(result.hasIssues);
      assert.ok(result.issues.includes('CIRCULAR_REFERRAL'));
    });

    it('should detect same IP', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
        lastLoginIp: '192.168.1.1',
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
      });

      const result = await detectFraud(newUser._id, referrer._id, { ip: '192.168.1.1' });

      assert.ok(result.hasIssues);
      assert.ok(result.issues.includes('SAME_IP'));
    });

    it('should return no issues for clean referral', async () => {
      const referrer = await User.create({
        username: 'referrer',
        email: 'referrer@example.com',
        password: 'password123',
        lastLoginIp: '192.168.1.1',
      });

      const newUser = await User.create({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
      });

      const result = await detectFraud(newUser._id, referrer._id, { ip: '192.168.1.2' });

      assert.equal(result.hasIssues, false);
      assert.equal(result.issues.length, 0);
    });
  });
});