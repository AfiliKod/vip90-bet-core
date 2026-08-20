import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import KycDocument from '../src/models/KycDocument.js';
import { submitKycDocuments, getUserKycStatus, approveKyc, rejectKyc, setKycUnderReview, checkKycRequired, getAllKycSubmissions, getKycStats, addKycRequirement, removeKycRequirement, KYC_REQUIREMENTS } from '../src/services/kyc.js';

describe('KYC System', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_kyc');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await KycDocument.deleteMany({});
  });

  describe('submitKycDocuments', () => {
    it('should submit KYC documents and set status to pending', async () => {
      const user = await User.create({
        username: 'kycuser',
        email: 'kyc@example.com',
        password: 'password123',
      });

      const documents = [
        {
          documentType: 'identity_card',
          fileName: 'id_card.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
          fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        },
        {
          documentType: 'selfie_with_id',
          fileName: 'selfie.jpg',
          fileSize: 512000,
          mimeType: 'image/jpeg',
          fileUrl: 'https://storage.example.com/kyc/selfie.jpg',
        },
      ];

      const kycDocs = await submitKycDocuments(user._id, documents);

      assert.equal(kycDocs.length, 2);
      assert.equal(kycDocs[0].documentType, 'identity_card');
      assert.equal(kycDocs[1].documentType, 'selfie_with_id');
      assert.equal(kycDocs[0].status, 'pending');
      assert.equal(kycDocs[1].status, 'pending');

      const updatedUser = await User.findById(user._id);
      assert.equal(updatedUser.kycStatus, 'pending');
      assert.ok(updatedUser.kycSubmittedAt);
    });

    it('should throw error if user already has pending KYC', async () => {
      const user = await User.create({
        username: 'kycuser2',
        email: 'kyc2@example.com',
        password: 'password123',
      });

      const documents = [
        {
          documentType: 'identity_card',
          fileName: 'id_card.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
          fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        },
      ];

      await submitKycDocuments(user._id, documents);

      try {
        await submitKycDocuments(user._id, documents);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already in progress'));
      }
    });

    it('should throw error for non-existent user', async () => {
      try {
        await submitKycDocuments(new mongoose.Types.ObjectId(), []);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('not found'));
      }
    });
  });

  describe('getUserKycStatus', () => {
    it('should return user KYC status with documents', async () => {
      const user = await User.create({
        username: 'kycuser3',
        email: 'kyc3@example.com',
        password: 'password123',
      });

      await KycDocument.create({
        userId: user._id,
        documentType: 'identity_card',
        fileName: 'id_card.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        status: 'pending',
      });

      const status = await getUserKycStatus(user._id);

      assert.ok(status);
      assert.equal(status.kycStatus, 'not_started'); // default
      assert.equal(status.documents.length, 1);
      assert.equal(status.documents[0].documentType, 'identity_card');
    });

    it('should return null for non-existent user', async () => {
      const status = await getUserKycStatus(new mongoose.Types.ObjectId());
      assert.equal(status, null);
    });
  });

  describe('approveKyc', () => {
    it('should approve KYC and update user status', async () => {
      const user = await User.create({
        username: 'kycuser4',
        email: 'kyc4@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      await KycDocument.create({
        userId: user._id,
        documentType: 'identity_card',
        fileName: 'id_card.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        status: 'pending',
      });

      const updatedUser = await approveKyc(user._id, admin._id);

      assert.equal(updatedUser.kycStatus, 'approved');
      assert.equal(updatedUser.kycVerified, true);
      assert.ok(updatedUser.kycApprovedAt);

      const docs = await KycDocument.find({ userId: user._id });
      assert.equal(docs[0].status, 'approved');
      assert.ok(docs[0].reviewedBy.equals(admin._id));
    });

    it('should throw error if KYC already approved', async () => {
      const user = await User.create({
        username: 'kycuser5',
        email: 'kyc5@example.com',
        password: 'password123',
        kycStatus: 'approved',
        kycVerified: true,
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      try {
        await approveKyc(user._id, admin._id);
        assert.fail('Should have thrown error');
      } catch (err) {
        assert.ok(err.message.includes('already approved'));
      }
    });
  });

  describe('rejectKyc', () => {
    it('should reject KYC with reason', async () => {
      const user = await User.create({
        username: 'kycuser6',
        email: 'kyc6@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      await KycDocument.create({
        userId: user._id,
        documentType: 'identity_card',
        fileName: 'id_card.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        status: 'pending',
      });

      const updatedUser = await rejectKyc(user._id, admin._id, 'Görsel kalitesi düşük');

      assert.equal(updatedUser.kycStatus, 'rejected');
      assert.equal(updatedUser.kycVerified, false);
      assert.ok(updatedUser.kycRejectedAt);
      assert.equal(updatedUser.kycRejectionReason, 'Görsel kalitesi düşük');

      const docs = await KycDocument.find({ userId: user._id });
      assert.equal(docs[0].status, 'rejected');
      assert.equal(docs[0].rejectionReason, 'Görsel kalitesi düşük');
    });
  });

  describe('setKycUnderReview', () => {
    it('should set KYC to under_review', async () => {
      const user = await User.create({
        username: 'kycuser7',
        email: 'kyc7@example.com',
        password: 'password123',
      });

      const admin = await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: 'password123',
        role: 'admin',
      });

      await KycDocument.create({
        userId: user._id,
        documentType: 'identity_card',
        fileName: 'id_card.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
        fileUrl: 'https://storage.example.com/kyc/id_card.jpg',
        status: 'pending',
      });

      const updatedUser = await setKycUnderReview(user._id, admin._id);

      assert.equal(updatedUser.kycStatus, 'under_review');

      const docs = await KycDocument.find({ userId: user._id });
      assert.equal(docs[0].status, 'under_review');
    });
  });

  describe('checkKycRequired', () => {
    it('should return not required for verified user', async () => {
      const user = await User.create({
        username: 'verified_user',
        email: 'verified@example.com',
        password: 'password123',
        kycStatus: 'approved',
        kycVerified: true,
      });

      const check = await checkKycRequired(user._id, 'withdrawal', 500);
      assert.equal(check.required, false);
    });

    it('should return required for unverified user with withdrawal', async () => {
      const user = await User.create({
        username: 'unverified_user',
        email: 'unverified@example.com',
        password: 'password123',
        kycStatus: 'not_started',
        kycVerified: false,
      });

      const check = await checkKycRequired(user._id, 'withdrawal', 500);
      assert.equal(check.required, true);
      assert.ok(check.message.includes('KYC'));
    });

    it('should not require KYC for small withdrawal below threshold', async () => {
      const user = await User.create({
        username: 'unverified_user2',
        email: 'unverified2@example.com',
        password: 'password123',
        kycStatus: 'not_started',
        kycVerified: false,
      });

      // withdrawal threshold is 100, testing with 50
      const check = await checkKycRequired(user._id, 'withdrawal', 50);
      assert.equal(check.required, false);
    });

    it('should return required for high_stakes_bet above threshold', async () => {
      const user = await User.create({
        username: 'unverified_user3',
        email: 'unverified3@example.com',
        password: 'password123',
        kycStatus: 'not_started',
        kycVerified: false,
      });

      const check = await checkKycRequired(user._id, 'high_stakes_bet', 1500);
      assert.equal(check.required, true);
    });

    it('should not require KYC for high_stakes_bet below threshold', async () => {
      const user = await User.create({
        username: 'unverified_user4',
        email: 'unverified4@example.com',
        password: 'password123',
        kycStatus: 'not_started',
        kycVerified: false,
      });

      const check = await checkKycRequired(user._id, 'high_stakes_bet', 500);
      assert.equal(check.required, false);
    });

    it('should return required if user has action in kycRequiredFor', async () => {
      const user = await User.create({
        username: 'custom_requirement_user',
        email: 'custom@example.com',
        password: 'password123',
        kycStatus: 'not_started',
        kycVerified: false,
        kycRequiredFor: ['casino_access'],
      });

      const check = await checkKycRequired(user._id, 'casino_access', 0);
      assert.equal(check.required, true);
    });
  });

  describe('getAllKycSubmissions', () => {
    it('should return paginated KYC submissions with doc counts', async () => {
      // Create users with different KYC statuses (no admin user needed for this test)
      for (let i = 1; i <= 5; i++) {
        await User.create({
          username: `user${i}`,
          email: `user${i}@example.com`,
          password: 'password123',
          kycStatus: i <= 2 ? 'pending' : 'approved',
          kycSubmittedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
        });
      }

      // Add documents
      const users = await User.find({ kycStatus: { $ne: 'not_started' } });
      for (const user of users) {
        await KycDocument.create({
          userId: user._id,
          documentType: 'identity_card',
          fileName: 'id.jpg',
          fileSize: 1000,
          mimeType: 'image/jpeg',
          fileUrl: 'https://example.com/id.jpg',
          status: user.kycStatus === 'pending' ? 'pending' : 'approved',
        });
      }

      const result = await getAllKycSubmissions({ page: 1, limit: 10 });

      assert.equal(result.total, 5);
      assert.equal(result.submissions.length, 5);
      assert.ok(result.submissions[0].docCounts);
      assert.ok(result.submissions[0].docCounts.pending >= 0);
    });

    it('should filter by status', async () => {
      // Create test users
      for (let i = 1; i <= 3; i++) {
        await User.create({
          username: `filter_user${i}`,
          email: `filter${i}@example.com`,
          password: 'password123',
          kycStatus: i <= 1 ? 'pending' : 'approved',
          kycSubmittedAt: new Date(),
        });
      }

      const result = await getAllKycSubmissions({ status: 'pending' });
      assert.ok(result.submissions.every(s => s.kycStatus === 'pending'));
    });
  });

  describe('getKycStats', () => {
    it('should return KYC statistics', async () => {
      for (let i = 1; i <= 3; i++) {
        await User.create({
          username: `stats_user${i}`,
          email: `stats${i}@example.com`,
          password: 'password123',
          kycStatus: 'approved',
          kycVerified: true,
          kycApprovedAt: new Date(),
        });
      }

      await User.create({
        username: 'stats_pending',
        email: 'pending@example.com',
        password: 'password123',
        kycStatus: 'pending',
        kycSubmittedAt: new Date(),
      });

      const stats = await getKycStats();

      assert.ok(stats.byStatus.length > 0);
      assert.ok(stats.recentSubmissions.length > 0);
      assert.ok(typeof stats.approvedToday === 'number');
    });
  });

  describe('addKycRequirement / removeKycRequirement', () => {
    it('should add KYC requirement for user', async () => {
      const user = await User.create({
        username: 'req_user',
        email: 'req@example.com',
        password: 'password123',
      });

      await addKycRequirement(user._id, 'custom_action');

      const updatedUser = await User.findById(user._id);
      assert.ok(updatedUser.kycRequiredFor.includes('custom_action'));
    });

    it('should not duplicate requirement', async () => {
      const user = await User.create({
        username: 'req_user2',
        email: 'req2@example.com',
        password: 'password123',
      });

      await addKycRequirement(user._id, 'custom_action');
      await addKycRequirement(user._id, 'custom_action'); // Duplicate

      const updatedUser = await User.findById(user._id);
      const count = updatedUser.kycRequiredFor.filter(r => r === 'custom_action').length;
      assert.equal(count, 1);
    });

    it('should remove KYC requirement', async () => {
      const user = await User.create({
        username: 'req_user3',
        email: 'req3@example.com',
        password: 'password123',
        kycRequiredFor: ['custom_action'],
      });

      await removeKycRequirement(user._id, 'custom_action');

      const updatedUser = await User.findById(user._id);
      assert.ok(!updatedUser.kycRequiredFor.includes('custom_action'));
    });
  });

  describe('KYC_REQUIREMENTS config', () => {
    it('should have withdrawal requirement with threshold', () => {
      assert.ok(KYC_REQUIREMENTS.withdrawal);
      assert.equal(KYC_REQUIREMENTS.withdrawal.required, true);
      assert.equal(KYC_REQUIREMENTS.withdrawal.minAmount, 100);
    });

    it('should have high_stakes_bet requirement with threshold', () => {
      assert.ok(KYC_REQUIREMENTS.high_stakes_bet);
      assert.equal(KYC_REQUIREMENTS.high_stakes_bet.required, true);
      assert.equal(KYC_REQUIREMENTS.high_stakes_bet.minAmount, 1000);
    });
  });
});