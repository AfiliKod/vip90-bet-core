/**
 * V1 — Demo verisi tohumlama çekirdeği.
 *
 * Kurulumu yapan operatörün satın alma sonrası ilk açtığı canlı demo ortamını
 * kurar: sınırlı yetkili demo yöneticisi, örnek oyuncular, örnek bahis ve
 * casino round geçmişi. Tüm veri GERÇEKÇİ AMA AÇIKÇA SAHTE'dir — kullanıcı
 * adları `demo_` önekli, e-postalar `@demo.local`, lig "DEMOLIG".
 *
 * İdempotent: her varlık deterministik anahtarla (username / externalId)
 * veya "kullanıcının kaydı zaten var mı" kontrolüyle kurulur; ikinci
 * koşu duplicate üretmez.
 */

const DEMO_DOMAIN = 'demo.local';

export function createDemoSeeder({ userModel, eventModel, betModel, casinoRoundModel }) {
  async function upsertUser(doc) {
    const existing = await userModel.findOne({ username: doc.username });
    if (existing) return { entity: `user:${doc.username}`, created: false };
    await userModel.create(doc);
    return { entity: `user:${doc.username}`, created: true };
  }

  async function ensureDemoEvent(now) {
    const externalId = 'demo-event-1';
    const existing = await eventModel.findOne({ externalId });
    if (existing) return { event: existing, created: false };
    const event = await eventModel.create({
      externalId,
      sport: 'Football',
      league: 'DEMOLIG',
      country: 'Demo',
      homeTeam: { name: 'Demo United', country: 'Demo' },
      awayTeam: { name: 'Demo City', country: 'Demo' },
      startTime: new Date(now + 24 * 60 * 60 * 1000),
      status: 'upcoming',
      markets: [{
        type: 'maç_sonucu',
        label: 'Maç Sonucu',
        odds: [
          { id: 'demo_ms1', label: '1', value: 2.10 },
          { id: 'demo_msx', label: 'X', value: 3.40 },
          { id: 'demo_ms2', label: '2', value: 3.10 },
        ],
      }],
    });
    return { event, created: true };
  }

  async function seedBetsFor(users, event) {
    // Kullanıcıda hiç bahis yoksa örnek geçmiş kur; varsa dokunma (idempotent).
    let createdAny = false;
    for (const [i, u] of users.entries()) {
      if ((await betModel.countDocuments({ userId: u._id })) > 0) continue;
      const stake = 50 + i * 25;
      await betModel.insertMany([
        {
          userId: u._id,
          selections: [{ eventId: event._id, oddId: 'demo_ms1', label: 'Demo United', value: 2.10, outcome: 'won' }],
          type: 'single',
          stake,
          totalOdds: 2.10,
          potentialWin: parseFloat((stake * 2.10).toFixed(2)),
          status: 'won',
        },
        {
          userId: u._id,
          selections: [{ eventId: event._id, oddId: 'demo_ms2', label: 'Demo City', value: 3.10, outcome: 'lost' }],
          type: 'single',
          stake: 25,
          totalOdds: 3.10,
          potentialWin: 77.5,
          status: 'lost',
        },
      ]);
      createdAny = true;
    }
    return createdAny;
  }

  async function seedRoundsFor(users) {
    let createdAny = false;
    for (const [i, u] of users.entries()) {
      if ((await casinoRoundModel.countDocuments({ userId: u._id })) > 0) continue;
      const bet = 20 + i * 10;
      const payout = i % 2 === 0 ? bet * 1.8 : 0;
      await casinoRoundModel.insertMany([
        {
          userId: u._id,
          gameId: 'demo_dice',
          gameTitle: 'Dice (Demo)',
          provider: 'inhouse',
          bet,
          payout,
          net: parseFloat((payout - bet).toFixed(2)),
          balanceBefore: 1000,
          balanceAfter: 1000 - bet + payout,
        },
        {
          userId: u._id,
          gameId: 'demo_mines',
          gameTitle: 'Mines (Demo)',
          provider: 'inhouse',
          bet: 10,
          payout: 0,
          net: -10,
          balanceBefore: 1000 - bet + payout,
          balanceAfter: 1000 - bet + payout - 10,
        },
      ]);
      createdAny = true;
    }
    return createdAny;
  }

  return {
    async seed({ now = Date.now() } = {}) {
      const created = [];
      const skipped = [];

      // 1. Sınırlı yetkili demo yöneticisi
      const adminRes = await upsertUser({
        username: 'demo_admin',
        email: `demo-admin@${DEMO_DOMAIN}`,
        password: 'DemoAdmin1234!',
        role: 'admin',
        isDemoAdmin: true,
        balance: 500,
      });
      (adminRes.created ? created : skipped).push(adminRes.entity);

      // 2. Örnek oyuncular
      const demoUsers = [];
      for (const name of ['demo_ayse', 'demo_baris', 'demo_can']) {
        const res = await upsertUser({
          username: name,
          email: `${name}@${DEMO_DOMAIN}`,
          password: 'DemoUser1234!',
          role: 'user',
          balance: 1000,
        });
        (res.created ? created : skipped).push(res.entity);
        demoUsers.push(await userModel.findOne({ username: name }));
      }

      // 3. Demo etkinlik
      const { event, created: eventCreated } = await ensureDemoEvent(now);
      (eventCreated ? created : skipped).push('event:demo-event-1');

      // 4. Bahis ve round geçmişleri
      if (await seedBetsFor(demoUsers, event)) created.push('bets');
      else skipped.push('bets');
      if (await seedRoundsFor(demoUsers)) created.push('casino-rounds');
      else skipped.push('casino-rounds');

      return { created, skipped };
    },
  };
}
