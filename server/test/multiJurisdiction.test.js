import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Jurisdiction from '../src/models/Jurisdiction.js';
import User from '../src/models/User.js';
import { 
  createJurisdiction, 
  getAllJurisdictions, 
  getJurisdictionByCode, 
  updateJurisdiction, 
  deleteJurisdiction, 
  checkPlayerEligibility,
  getJurisdictionStats
} from '../src/services/multiJurisdiction.js';

describe('Multi-Jurisdiction Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_jurisdiction');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Jurisdiction.deleteMany({});
  });

  describe('createJurisdiction', () => {
    it('should create a new jurisdiction', async () => {
      const jurisdiction = await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
        requirements: {
          minimumAge: 18,
          kycRequired: true,
        },
      });

      assert.ok(jurisdiction._id);
      assert.equal(jurisdiction.code, 'TR');
      assert.equal(jurisdiction.name, 'Turkey');
    });

    it('should reject duplicate code', async () => {
      await createJurisdiction({ code: 'TR', name: 'Turkey' });

      try {
        await createJurisdiction({ code: 'TR', name: 'Another Turkey' });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('already exists'));
      }
    });
  });

  describe('getAllJurisdictions', () => {
    it('should return all jurisdictions', async () => {
      await createJurisdiction({ code: 'TR', name: 'Turkey' });
      await createJurisdiction({ code: 'US', name: 'United States' });

      const result = await getAllJurisdictions();

      assert.equal(result.jurisdictions.length, 2);
    });
  });

  describe('getJurisdictionByCode', () => {
    it('should return jurisdiction by code', async () => {
      await createJurisdiction({ code: 'TR', name: 'Turkey' });

      const jurisdiction = await getJurisdictionByCode('TR');

      assert.equal(jurisdiction.name, 'Turkey');
    });
  });

  describe('updateJurisdiction', () => {
    it('should update jurisdiction', async () => {
      const jurisdiction = await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
      });

      const updated = await updateJurisdiction(jurisdiction._id, {
        name: 'Türkiye',
      });

      assert.equal(updated.name, 'Türkiye');
    });
  });

  describe('deleteJurisdiction', () => {
    it('should delete non-default jurisdiction', async () => {
      const jurisdiction = await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
      });

      await deleteJurisdiction(jurisdiction._id);

      const found = await Jurisdiction.findById(jurisdiction._id);
      assert.equal(found, null);
    });

    it('should not delete default jurisdiction', async () => {
      const jurisdiction = await createJurisdiction({
        code: 'DEFAULT',
        name: 'Default',
        isDefault: true,
      });

      try {
        await deleteJurisdiction(jurisdiction._id);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('Cannot delete default'));
      }
    });
  });

  describe('checkPlayerEligibility', () => {
    it('should allow eligible player', async () => {
      await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
        requirements: { minimumAge: 18 },
      });

      const player = { age: 25 };
      const result = await checkPlayerEligibility(player, 'play', { jurisdictionCode: 'TR' });

      assert.equal(result.eligible, true);
    });

    it('should block underage player', async () => {
      await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
        requirements: { minimumAge: 18 },
      });

      const player = { age: 16 };
      const result = await checkPlayerEligibility(player, 'play', { jurisdictionCode: 'TR' });

      assert.equal(result.eligible, false);
      assert.ok(result.reason.includes('age'));
    });

    it('should block player without KYC when required', async () => {
      await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
        requirements: { kycRequired: true },
      });

      const player = { kycVerified: false };
      const result = await checkPlayerEligibility(player, 'play', { jurisdictionCode: 'TR' });

      assert.equal(result.eligible, false);
      assert.ok(result.reason.includes('KYC'));
    });

    it('should block restricted game type', async () => {
      await createJurisdiction({
        code: 'TR',
        name: 'Turkey',
        requirements: { restrictedGameTypes: ['poker'] },
      });

      const player = {};
      const result = await checkPlayerEligibility(player, 'play', { jurisdictionCode: 'TR', gameType: 'poker' });

      assert.equal(result.eligible, false);
      assert.ok(result.reason.includes('restricted'));
    });
  });

  describe('getJurisdictionStats', () => {
    it('should return jurisdiction statistics', async () => {
      await createJurisdiction({ code: 'TR', name: 'Turkey', isActive: true });
      await createJurisdiction({ code: 'US', name: 'United States', isActive: false });

      const stats = await getJurisdictionStats();

      assert.equal(stats.total, 2);
      assert.equal(stats.active, 1);
    });
  });
});
