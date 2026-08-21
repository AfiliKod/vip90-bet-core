import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createDemoSeeder } from '../src/demo/seedCore.js';

// ─── Sahte modeller ─────────────────────────────────────────────────

function fakeUserModel() {
  const users = [];
  return {
    users,
    async findOne(filter) {
      return users.find(u => u.username === filter.username) || null;
    },
    async create(doc) {
      const u = { _id: `u${users.length + 1}`, role: 'user', ...doc };
      users.push(u);
      return u;
    },
  };
}

function fakeEventModel() {
  const events = [];
  return {
    events,
    async findOne(filter) {
      return events.find(e => e.externalId === filter.externalId) || null;
    },
    async create(doc) {
      const e = { _id: `e${events.length + 1}`, status: 'upcoming', ...doc };
      events.push(e);
      return e;
    },
  };
}

function fakeBetModel() {
  const bets = [];
  return {
    bets,
    async countDocuments(filter) {
      return bets.filter(b => String(b.userId) === String(filter.userId)).length;
    },
    async insertMany(docs) {
      bets.push(...docs.map((d, i) => ({ _id: `b${bets.length + i + 1}`, ...d })));
      return docs.length;
    },
  };
}

function fakeRoundModel() {
  const rounds = [];
  return {
    rounds,
    async countDocuments(filter) {
      return rounds.filter(r => String(r.userId) === String(filter.userId)).length;
    },
    async insertMany(docs) {
      rounds.push(...docs.map((d, i) => ({ _id: `r${rounds.length + i + 1}`, ...d })));
      return docs.length;
    },
  };
}

const deps = () => ({
  userModel: fakeUserModel(),
  eventModel: fakeEventModel(),
  betModel: fakeBetModel(),
  casinoRoundModel: fakeRoundModel(),
});

describe('createDemoSeeder — V1 demo verisi', () => {
  test('demo admin\'i role=admin + isDemoAdmin bayrağıyla kurar', async () => {
    const d = deps();
    await createDemoSeeder(d).seed();
    const admin = d.userModel.users.find(u => u.username === 'demo_admin');
    assert.ok(admin, 'demo_admin yok');
    assert.strictEqual(admin.role, 'admin');
    assert.strictEqual(admin.isDemoAdmin, true);
  });

  test('demo kullanıcılar yalnızca demo.local e-postasıyla oluşur', async () => {
    const d = deps();
    await createDemoSeeder(d).seed();
    const demos = d.userModel.users.filter(u => u.username.startsWith('demo_'));
    assert.ok(demos.length >= 3, 'en az 3 demo kullanıcı olmalı');
    for (const u of demos) {
      assert.match(u.email, /@demo\.local$/, `${u.username} e-postası demo.local değil`);
    }
  });

  test('demo bahisleri demo etkinliğe bağlanır ve kullanıcı başına bir kez oluşur', async () => {
    const d = deps();
    const summary = await createDemoSeeder(d).seed();
    assert.ok(d.eventModel.events.some(e => e.externalId === 'demo-event-1'));
    assert.ok(d.betModel.bets.length > 0, 'örnek bahis yok');
    assert.ok(summary.created.includes('bets'));

    // İkinci koşu: mevcut bahisli kullanıcılara dokunmaz
    const before = d.betModel.bets.length;
    const s2 = await createDemoSeeder(d).seed();
    assert.strictEqual(d.betModel.bets.length, before);
    assert.ok(s2.skipped.includes('bets'));
  });

  test('casino round geçmişi kullanıcı başına bir kez oluşur', async () => {
    const d = deps();
    const s1 = await createDemoSeeder(d).seed();
    assert.ok(d.casinoRoundModel.rounds.length > 0);
    assert.ok(s1.created.includes('casino-rounds'));
    const before = d.casinoRoundModel.rounds.length;
    const s2 = await createDemoSeeder(d).seed();
    assert.strictEqual(d.casinoRoundModel.rounds.length, before);
    assert.ok(s2.skipped.includes('casino-rounds'));
  });

  test('İDEMPOTENTLİK: tam iki koşu sonunda hiçbir varlık çoğalmaz', async () => {
    const d = deps();
    await createDemoSeeder(d).seed();
    await createDemoSeeder(d).seed();
    const adminCount = d.userModel.users.filter(u => u.username === 'demo_admin').length;
    assert.strictEqual(adminCount, 1);
    const eventCount = d.eventModel.events.filter(e => e.externalId === 'demo-event-1').length;
    assert.strictEqual(eventCount, 1);
  });

  test('özet gerçekçi ama sahte veri taahhüdünü korur: tüm e-postalar demo.local', async () => {
    const d = deps();
    await createDemoSeeder(d).seed();
    for (const u of d.userModel.users.filter(u => u.username.startsWith('demo_'))) {
      assert.ok(u.email.endsWith('@demo.local'));
    }
  });
});
