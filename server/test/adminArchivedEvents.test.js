// server/test/adminArchivedEvents.test.js
// Faz 8: GET /admin/events/archived — sport query param filtresi
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Event from '../src/models/Event.js';
import { getArchivedEvents } from '../src/controllers/admin.js';

function mockRes() {
  const res = {};
  res.json = (body) => { res.body = body; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  return res;
}

describe('admin getArchivedEvents sport filtresi', () => {
  before(async () => {
    await mongoose.connect('mongodb://localhost:27017/betzone_test_archived_sport');
  });
  after(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Event.deleteMany({});
    const base = {
      homeTeam: { name: 'A' },
      awayTeam: { name: 'B' },
      league: 'L',
      status: 'finished',
      archivedAt: new Date(),
      startTime: new Date(Date.now() - 86400000),
      markets: [],
    };
    await Event.create([
      { ...base, sport: 'football', homeTeam: { name: 'F1' } },
      { ...base, sport: 'football', homeTeam: { name: 'F2' } },
      { ...base, sport: 'basketball', homeTeam: { name: 'B1' } },
      // arşivlenmemiş — filtre ne olursa olsun gelmemeli
      { ...base, sport: 'football', archivedAt: null, homeTeam: { name: 'Live' } },
    ]);
  });

  it('sport paramı yokken tüm arşivli etkinlikleri döner', async () => {
    const req = { query: {} };
    const res = mockRes();
    let nextErr = null;
    await getArchivedEvents(req, res, (e) => { nextErr = e; });
    assert.ifError(nextErr);
    assert.equal(res.body.total, 3);
  });

  it('sport=football yalnızca futbol arşivini döner', async () => {
    const req = { query: { sport: 'football' } };
    const res = mockRes();
    let nextErr = null;
    await getArchivedEvents(req, res, (e) => { nextErr = e; });
    assert.ifError(nextErr);
    assert.equal(res.body.total, 2);
    assert.ok(res.body.events.every(e => e.sport === 'football'));
  });

  it('sport=all tüm arşivliyi döner (aktif filtre gibi davranmaz)', async () => {
    const req = { query: { sport: 'all' } };
    const res = mockRes();
    let nextErr = null;
    await getArchivedEvents(req, res, (e) => { nextErr = e; });
    assert.ifError(nextErr);
    assert.equal(res.body.total, 3);
  });

  it('sport=basketball + search birlikte çalışır', async () => {
    const req = { query: { sport: 'basketball', search: 'B1' } };
    const res = mockRes();
    let nextErr = null;
    await getArchivedEvents(req, res, (e) => { nextErr = e; });
    assert.ifError(nextErr);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.events[0].sport, 'basketball');
  });
});
