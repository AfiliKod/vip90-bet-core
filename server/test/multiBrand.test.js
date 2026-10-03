import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Brand from '../src/models/Brand.js';
import User from '../src/models/User.js';
import { 
  createBrand, 
  getAllBrands, 
  getBrandBySlug, 
  updateBrand, 
  deleteBrand, 
  addDomain, 
  removeDomain, 
  getBrandStats
} from '../src/services/multiBrand.js';

describe('Multi-Brand Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_brand');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Brand.deleteMany({});
  });

  describe('createBrand', () => {
    it('should create a new brand', async () => {
      const brand = await createBrand({
        name: 'VIP90',
        slug: 'vip90',
        description: 'Main brand',
        domains: [{ domain: 'vip90.com', isPrimary: true }],
      });

      assert.ok(brand._id);
      assert.equal(brand.name, 'VIP90');
      assert.equal(brand.slug, 'vip90');
    });

    it('should reject duplicate slug', async () => {
      await createBrand({ name: 'Brand 1', slug: 'duplicate' });

      try {
        await createBrand({ name: 'Brand 2', slug: 'duplicate' });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('already exists'));
      }
    });
  });

  describe('getAllBrands', () => {
    it('should return all brands', async () => {
      await createBrand({ name: 'Brand 1', slug: 'brand-1' });
      await createBrand({ name: 'Brand 2', slug: 'brand-2' });

      const result = await getAllBrands();

      assert.equal(result.brands.length, 2);
    });
  });

  describe('getBrandBySlug', () => {
    it('should return brand by slug', async () => {
      await createBrand({ name: 'VIP90', slug: 'vip90' });

      const brand = await getBrandBySlug('vip90');

      assert.equal(brand.name, 'VIP90');
    });
  });

  describe('updateBrand', () => {
    it('should update brand', async () => {
      const brand = await createBrand({
        name: 'Original',
        slug: 'original',
      });

      const updated = await updateBrand(brand._id, {
        name: 'Updated',
      });

      assert.equal(updated.name, 'Updated');
    });
  });

  describe('deleteBrand', () => {
    it('should delete non-default brand', async () => {
      const brand = await createBrand({
        name: 'To Delete',
        slug: 'to-delete',
      });

      await deleteBrand(brand._id);

      const found = await Brand.findById(brand._id);
      assert.equal(found, null);
    });
  });

  describe('addDomain', () => {
    it('should add domain to brand', async () => {
      const brand = await createBrand({
        name: 'VIP90',
        slug: 'vip90',
      });

      const updated = await addDomain(brand._id, 'vip90.com');

      assert.equal(updated.domains.length, 1);
      assert.equal(updated.domains[0].domain, 'vip90.com');
    });

    it('should reject duplicate domain', async () => {
      const brand = await createBrand({
        name: 'VIP90',
        slug: 'vip90',
        domains: [{ domain: 'vip90.com' }],
      });

      try {
        await addDomain(brand._id, 'vip90.com');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('already exists'));
      }
    });
  });

  describe('removeDomain', () => {
    it('should remove domain from brand', async () => {
      const brand = await createBrand({
        name: 'VIP90',
        slug: 'vip90',
        domains: [{ domain: 'vip90.com' }, { domain: 'www.vip90.com' }],
      });

      const updated = await removeDomain(brand._id, 'www.vip90.com');

      assert.equal(updated.domains.length, 1);
    });

    it('should not remove primary domain', async () => {
      const brand = await createBrand({
        name: 'VIP90',
        slug: 'vip90',
        domains: [{ domain: 'vip90.com', isPrimary: true }],
      });

      try {
        await removeDomain(brand._id, 'vip90.com');
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('Cannot remove primary'));
      }
    });
  });

  describe('getBrandStats', () => {
    it('should return brand statistics', async () => {
      await createBrand({ name: 'Brand 1', slug: 'brand-1', isActive: true });
      await createBrand({ name: 'Brand 2', slug: 'brand-2', isActive: false });

      const stats = await getBrandStats();

      assert.equal(stats.total, 2);
      assert.equal(stats.active, 1);
    });
  });
});
