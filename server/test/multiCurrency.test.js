import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Currency from '../src/models/Currency.js';
import User from '../src/models/User.js';
import { 
  createCurrency, 
  getAllCurrencies, 
  getCurrencyByCode, 
  updateCurrency, 
  deleteCurrency, 
  convertAmount,
  updateExchangeRate,
  getCurrencyStats
} from '../src/services/multiCurrency.js';

describe('Multi-Currency Service', () => {
  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_currency');
  });

  after(async () => {
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Currency.deleteMany({});
  });

  describe('createCurrency', () => {
    it('should create a new currency', async () => {
      const currency = await createCurrency({
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        exchangeRate: 32.5,
      });

      assert.ok(currency._id);
      assert.equal(currency.code, 'USD');
      assert.equal(currency.exchangeRate, 32.5);
    });

    it('should reject duplicate currency code', async () => {
      await createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 32.5 });

      try {
        await createCurrency({ code: 'USD', name: 'Another Dollar', symbol: '$', exchangeRate: 33 });
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('already exists'));
      }
    });
  });

  describe('getAllCurrencies', () => {
    it('should return all currencies', async () => {
      await createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 32.5 });
      await createCurrency({ code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 35 });

      const result = await getAllCurrencies();

      assert.equal(result.currencies.length, 2);
    });
  });

  describe('getCurrencyByCode', () => {
    it('should return currency by code', async () => {
      await createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 32.5 });

      const currency = await getCurrencyByCode('USD');

      assert.equal(currency.code, 'USD');
    });
  });

  describe('updateCurrency', () => {
    it('should update currency', async () => {
      const currency = await createCurrency({
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        exchangeRate: 32.5,
      });

      const updated = await updateCurrency(currency._id, {
        exchangeRate: 33,
      });

      assert.equal(updated.exchangeRate, 33);
    });
  });

  describe('deleteCurrency', () => {
    it('should delete non-default currency', async () => {
      const currency = await createCurrency({
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        exchangeRate: 32.5,
      });

      await deleteCurrency(currency._id);

      const found = await Currency.findById(currency._id);
      assert.equal(found, null);
    });

    it('should not delete default currency', async () => {
      const currency = await createCurrency({
        code: 'TRY',
        name: 'Turkish Lira',
        symbol: '₺',
        exchangeRate: 1,
        isDefault: true,
      });

      try {
        await deleteCurrency(currency._id);
        assert.fail('Should have thrown error');
      } catch (error) {
        assert.ok(error.message.includes('Cannot delete default'));
      }
    });
  });

  describe('convertAmount', () => {
    it('should convert between currencies', async () => {
      // TRY = 1 (base), USD = 32.5 (1 USD = 32.5 TRY)
      await createCurrency({ code: 'TRY', name: 'Turkish Lira', symbol: '₺', exchangeRate: 1, isDefault: true });
      await createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 32.5 });

      // 100 TRY = 100/32.5 = 3.08 USD
      const result = await convertAmount(100, 'TRY', 'USD');

      assert.equal(result.from, 'TRY');
      assert.equal(result.to, 'USD');
      assert.equal(result.result, 3.08);
    });
  });

  describe('getCurrencyStats', () => {
    it('should return currency statistics', async () => {
      await createCurrency({ code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 32.5 });
      await createCurrency({ code: 'EUR', name: 'Euro', symbol: '€', exchangeRate: 35, isActive: false });

      const stats = await getCurrencyStats();

      assert.equal(stats.total, 2);
      assert.equal(stats.active, 1);
    });
  });
});
