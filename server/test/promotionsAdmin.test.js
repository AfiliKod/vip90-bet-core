import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { upsertPromotionSchema } from '../src/validators/admin.js';
import Promotion from '../src/models/Promotion.js';

describe('upsertPromotionSchema', () => {
  test('geçerli bir kampanya kabul edilir', () => {
    const r = upsertPromotionSchema.safeParse({
      type: 'welcome', title: 'Hoşgeldin Bonusu', amount: 1000,
      minOdds: 1.5, wageringMultiplier: 35, deadlineDays: 30, isActive: true,
    });
    assert.strictEqual(r.success, true);
  });

  test('bilinmeyen tür reddedilir', () => {
    const r = upsertPromotionSchema.safeParse({ type: 'not-a-type', title: 'X', amount: 10 });
    assert.strictEqual(r.success, false);
  });

  test('title eksikse reddedilir', () => {
    const r = upsertPromotionSchema.safeParse({ type: 'welcome', amount: 10 });
    assert.strictEqual(r.success, false);
  });

  test('negatif amount reddedilir', () => {
    const r = upsertPromotionSchema.safeParse({ type: 'welcome', title: 'X', amount: -5 });
    assert.strictEqual(r.success, false);
  });

  test('güncelleme için id opsiyonel olarak kabul edilir', () => {
    const r = upsertPromotionSchema.safeParse({
      id: '507f1f77bcf86cd799439011', type: 'trial', title: 'X', amount: 500,
    });
    assert.strictEqual(r.success, true);
  });

  test('sadece bilinen alanlar (whitelist dışı alan ekstra veri olarak yok sayılır değil, zod strict değilse geçer ama gameWeights record şekli doğrulanır)', () => {
    const r = upsertPromotionSchema.safeParse({
      type: 'reload', title: 'X', amount: 100, gameWeights: { crash: 1, mines: 0.5 },
    });
    assert.strictEqual(r.success, true);
  });
});

describe('Promotion admin CRUD (model seviyesinde — controller bu model üzerinde ince bir katman)', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_promotions_admin');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promotion.deleteMany({});
  });

  test('yeni kampanya oluşturulabilir (öncesinde tek yol tek seferlik scriptti)', async () => {
    const promo = await Promotion.create({ type: 'trial', title: 'Deneme Bonusu', amount: 500 });
    assert.equal(promo.title, 'Deneme Bonusu');
    assert.equal(promo.isActive, true);
  });

  test('list tüm kayıtları döner — pasif olanlar dahil (kullanıcı-yüzü listeden farklı)', async () => {
    await Promotion.create({ type: 'welcome', title: 'Aktif', amount: 100, isActive: true });
    await Promotion.create({ type: 'reload', title: 'Pasif', amount: 200, isActive: false });

    const all = await Promotion.find();
    assert.equal(all.length, 2);

    const onlyActive = await Promotion.find({ isActive: true });
    assert.equal(onlyActive.length, 1);
    assert.equal(onlyActive[0].title, 'Aktif');
  });

  test('mevcut bir kampanya güncellenebilir (findByIdAndUpdate — admin route deseni)', async () => {
    const promo = await Promotion.create({ type: 'freeBet', title: 'Eski Başlık', amount: 50 });
    const updated = await Promotion.findByIdAndUpdate(
      promo._id,
      { title: 'Yeni Başlık', isActive: false },
      { new: true, runValidators: true },
    );
    assert.equal(updated.title, 'Yeni Başlık');
    assert.equal(updated.isActive, false);
  });

  test('kampanya silinebilir', async () => {
    const promo = await Promotion.create({ type: 'trial', title: 'Silinecek', amount: 10 });
    await Promotion.findByIdAndDelete(promo._id);
    const found = await Promotion.findById(promo._id);
    assert.equal(found, null);
  });
});
