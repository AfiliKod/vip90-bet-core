import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import StaticPage from '../src/models/StaticPage.js';
import {
  getPublicPageList, getPublicPage, listAllForAdmin, upsertPage, togglePage, seedDefaultPages,
} from '../src/services/staticPages.js';

describe('Static Pages Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_staticpages');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await StaticPage.deleteMany({});
  });

  describe('seedDefaultPages', () => {
    it('should create the default 11 pages when collection is empty', async () => {
      await seedDefaultPages();
      const count = await StaticPage.countDocuments();
      assert.equal(count, 11);
    });

    it('should be idempotent — does nothing if collection already has data', async () => {
      await seedDefaultPages();
      await StaticPage.deleteOne({ slug: 'about' });
      await seedDefaultPages(); // should NOT re-add 'about' since collection is non-empty
      const about = await StaticPage.findOne({ slug: 'about' });
      assert.equal(about, null);
    });

    it('should seed all legal pages as enabled by default', async () => {
      await seedDefaultPages();
      const legalPages = await StaticPage.find({ category: 'legal' });
      assert.equal(legalPages.length, 7);
      for (const p of legalPages) assert.equal(p.isEnabled, true);
    });
  });

  describe('getPublicPageList / getPublicPage', () => {
    it('should only return enabled pages in the public list', async () => {
      await seedDefaultPages();
      await StaticPage.updateOne({ slug: 'about' }, { isEnabled: false });

      const list = await getPublicPageList();
      assert.ok(!list.some(p => p.slug === 'about'));
      assert.ok(list.some(p => p.slug === 'career'));
    });

    it('should return null for a disabled page via getPublicPage', async () => {
      await seedDefaultPages();
      await StaticPage.updateOne({ slug: 'about' }, { isEnabled: false });

      const page = await getPublicPage('about');
      assert.equal(page, null);
    });

    it('should return the page for an enabled slug', async () => {
      await seedDefaultPages();
      const page = await getPublicPage('legal-terms');
      assert.ok(page);
      assert.equal(page.title, 'Kullanım Koşulları');
    });
  });

  describe('upsertPage / togglePage', () => {
    it('should update title/intro/sections of an existing page', async () => {
      await seedDefaultPages();
      const adminId = new mongoose.Types.ObjectId();

      const updated = await upsertPage('about', {
        title: 'Yeni Başlık',
        intro: 'Yeni giriş',
        sections: [{ title: 'Bölüm 1', content: ['Metin 1'] }],
      }, adminId);

      assert.equal(updated.title, 'Yeni Başlık');
      assert.equal(updated.sections.length, 1);
      assert.equal(updated.updatedBy.toString(), adminId.toString());
    });

    it('should throw for a non-existent slug', async () => {
      await seedDefaultPages();
      await assert.rejects(() => upsertPage('nope', { title: 'x', sections: [] }, null));
    });

    it('should toggle isEnabled', async () => {
      await seedDefaultPages();
      const adminId = new mongoose.Types.ObjectId();

      const toggled = await togglePage('about', false, adminId);
      assert.equal(toggled.isEnabled, false);

      const list = await getPublicPageList();
      assert.ok(!list.some(p => p.slug === 'about'));
    });
  });

  describe('listAllForAdmin', () => {
    it('should return disabled pages too', async () => {
      await seedDefaultPages();
      await StaticPage.updateOne({ slug: 'about' }, { isEnabled: false });

      const all = await listAllForAdmin();
      assert.equal(all.length, 11);
      assert.ok(all.some(p => p.slug === 'about' && p.isEnabled === false));
    });
  });
});
