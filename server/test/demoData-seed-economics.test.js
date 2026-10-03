// server/test/demoData-seed-economics.test.js
// Faz 3: seed nesilleri gerçekçi house-edge ile üretilmeli.
// Eski casino RTP=%135 ve sports sabit %40 kazanma (E[odd]≈2.77)
// analytics GGR'yi negatife çevirip Dashboard'a −₺43.4k üretiyordu.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import CasinoRound from '../src/models/CasinoRound.js';
import Bet from '../src/models/Bet.js';
import Event from '../src/models/Event.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as casinoSeed from '../src/services/demoData/casinoSeed.js';
import * as sportsSeed from '../src/services/demoData/sportsSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData seed ekonomisi — pozitif house-edge', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_economics');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await CasinoRound.deleteMany({});
    await Bet.deleteMany({});
    await Event.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('casino seed toplam GGR (house) pozitif kalır (RTP ≈ %96)', async () => {
    // N=500'de tek-round payout varyansı (uniform çarpan 1-3.8x, bahis 5-200)
    // RTP örneklem SD'sini ~7 puana çıkarıp testi flaky yapıyordu (4 koşudan
    // 1'i 85-105 bandının dışına düşüyordu). N=4000 varyansı sqrt(500/4000)
    // ≈ 0.35 ile ~2.5 puana indirir, band ile arada güvenli marj kalır.
    await casinoSeed.load(4000);
    const [agg] = await CasinoRound.aggregate([
      { $group: { _id: null, totalBet: { $sum: '$bet' }, totalPayout: { $sum: '$payout' }, ggr: { $sum: { $multiply: ['$net', -1] } } } },
    ]);
    assert.ok(agg, 'casino round bulunmalı');
    assert.ok(agg.totalBet > 0, 'toplam bet > 0');
    assert.ok(agg.ggr > 0, `casino house GGR pozitif olmalı, ggr=${agg.ggr}`);
    const rtp = (agg.totalPayout / agg.totalBet) * 100;
    assert.ok(rtp > 85 && rtp < 105, `casino RTP 85-105 aralığında olmalı, rtp=${rtp.toFixed(1)}%`);
  });

  it('sports seed toplam GGR (house) pozitif kalır (marj ≈ %6)', async () => {
    // Yüksek odds varyansı için N büyük tutulur (E[GGR]≈+0.06·stake).
    await sportsSeed.load(2000);
    const [agg] = await Bet.aggregate([
      { $match: { status: { $in: ['won', 'lost'] } } },
      { $group: { _id: null, stake: { $sum: '$stake' }, ggr: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, '$stake', { $subtract: ['$stake', '$potentialWin'] }] } } } },
    ]);
    assert.ok(agg, 'settled bet bulunmalı');
    assert.ok(agg.stake > 0, 'toplam stake > 0');
    assert.ok(agg.ggr > 0, `sports house GGR pozitif olmalı, ggr=${agg.ggr}`);
    const margin = (agg.ggr / agg.stake) * 100;
    assert.ok(margin > -2 && margin < 15, `sports marj -2..15% aralığında, margin=${margin.toFixed(1)}%`);
  });
});
