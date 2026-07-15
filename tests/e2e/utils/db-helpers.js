import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test';
const DB_NAME = 'betzone_test';

let _client = null;

export async function getMongoClient() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI);
    await _client.connect();
  }
  return _client;
}

export async function getDb() {
  const client = await getMongoClient();
  return client.db(DB_NAME);
}

export async function seedTestData(db) {
  const now = new Date();

  // Test users
  await db.collection('users').deleteMany({ email: /^test-.*@betzone\.test$/ });
  await db.collection('users').insertMany([
    {
      email: 'test-user@betzone.test',
      username: 'testuser',
      password: '$2a$10$testhash', // bcrypt hash of 'password123'
      balance: 10000,
      bonusBalance: 0,
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      email: 'test-user2@betzone.test',
      username: 'testuser2',
      password: '$2a$10$testhash',
      balance: 5000,
      bonusBalance: 1000,
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Test events
  await db.collection('events').deleteMany({ externalId: /^test-/ });
  await db.collection('events').insertMany([
    // UPCOMING - pre-match football
    {
      externalId: 'test-upcoming-1',
      sport: 'football',
      country: 'Turkey',
      league: 'Süper Lig',
      leagueFlag: '🇹🇷',
      homeTeam: { name: 'Galatasaray', country: 'Turkey' },
      awayTeam: { name: 'Fenerbahçe', country: 'Turkey' },
      startTime: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      status: 'upcoming',
      liveScore: { home: 0, away: 0, minute: 0 },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'ms1', label: '1', value: 2.10, isActive: true },
            { id: 'msx', label: 'X', value: 3.40, isActive: true },
            { id: 'ms2', label: '2', value: 3.20, isActive: true },
          ],
        },
        {
          type: 'alt_üst',
          label: 'Alt/Üst 2.5',
          odds: [
            { id: 'ou1', label: 'Üst 2.5', value: 1.85, isActive: true },
            { id: 'ou2', label: 'Alt 2.5', value: 1.95, isActive: true },
          ],
        },
        {
          type: 'handikap',
          label: 'Handikap (0:1)',
          odds: [
            { id: 'hc1', label: '1 (0:1)', value: 1.75, isActive: true },
            { id: 'hc2', label: '2 (0:1)', value: 2.05, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // UPCOMING - basketball
    {
      externalId: 'test-upcoming-2',
      sport: 'basketball',
      country: 'USA',
      league: 'NBA',
      leagueFlag: '🇺🇸',
      homeTeam: { name: 'Lakers', country: 'USA' },
      awayTeam: { name: 'Celtics', country: 'USA' },
      startTime: new Date(now.getTime() + 3 * 60 * 60 * 1000),
      status: 'upcoming',
      liveScore: { home: 0, away: 0, minute: 0 },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'bms1', label: '1', value: 1.80, isActive: true },
            { id: 'bms2', label: '2', value: 2.00, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // LIVE - football in progress
    {
      externalId: 'test-live-1',
      sport: 'football',
      country: 'England',
      league: 'Premier League',
      leagueFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      homeTeam: { name: 'Arsenal', country: 'England' },
      awayTeam: { name: 'Chelsea', country: 'England' },
      startTime: new Date(now.getTime() - 30 * 60 * 1000),
      status: 'live',
      liveScore: { home: 1, away: 0, minute: 35 },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'lms1', label: '1', value: 1.65, isActive: true },
            { id: 'lmsx', label: 'X', value: 3.80, isActive: true },
            { id: 'lms2', label: '2', value: 5.20, isActive: true },
          ],
        },
        {
          type: 'alt_üst',
          label: 'Alt/Üst 2.5',
          odds: [
            { id: 'lou1', label: 'Üst 2.5', value: 2.10, isActive: true },
            { id: 'lou2', label: 'Alt 2.5', value: 1.70, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // LIVE - basketball
    {
      externalId: 'test-live-2',
      sport: 'basketball',
      country: 'USA',
      league: 'NBA',
      leagueFlag: '🇺🇸',
      homeTeam: { name: 'Lakers', country: 'USA' },
      awayTeam: { name: 'Warriors', country: 'USA' },
      startTime: new Date(now.getTime() - 45 * 60 * 1000),
      status: 'live',
      liveScore: { home: 98, away: 102, minute: 42, scope: 'quarter' },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'l2ms1', label: '1', value: 2.50, isActive: true },
            { id: 'l2ms2', label: '2', value: 1.55, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // FINISHED - known result for settlement testing
    {
      externalId: 'test-finished-1',
      sport: 'football',
      country: 'Spain',
      league: 'La Liga',
      leagueFlag: '🇪🇸',
      homeTeam: { name: 'Real Madrid', country: 'Spain' },
      awayTeam: { name: 'Barcelona', country: 'Spain' },
      startTime: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      status: 'finished',
      liveScore: { home: 2, away: 1, minute: 90 },
      result: { winner: 'home', score: '2-1' },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'fms1', label: '1', value: 2.00, isActive: true },
            { id: 'fmsx', label: 'X', value: 3.30, isActive: true },
            { id: 'fms2', label: '2', value: 3.40, isActive: true },
          ],
        },
        {
          type: 'alt_üst',
          label: 'Alt/Üst 2.5',
          odds: [
            { id: 'fou1', label: 'Üst 2.5', value: 1.90, isActive: true },
            { id: 'fou2', label: 'Alt 2.5', value: 1.85, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    // FINISHED - for combo bet testing
    {
      externalId: 'test-finished-2',
      sport: 'tennis',
      country: 'UK',
      league: 'Wimbledon',
      leagueFlag: '🇬🇧',
      homeTeam: { name: 'Djokovic', country: 'Serbia' },
      awayTeam: { name: 'Alcaraz', country: 'Spain' },
      startTime: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      status: 'finished',
      liveScore: { home: 3, away: 1, minute: 180 },
      result: { winner: 'away', score: '1-3' },
      markets: [
        {
          type: 'maç_sonucu',
          label: 'Maç Sonucu',
          odds: [
            { id: 'tms1', label: '1', value: 2.20, isActive: true },
            { id: 'tms2', label: '2', value: 1.65, isActive: true },
          ],
        },
      ],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  console.log('✅ Test data seeded');
}

export async function cleanupTestData(db) {
  await db.collection('users').deleteMany({ email: /^test-.*@betzone\.test$/ });
  await db.collection('events').deleteMany({ externalId: /^test-/ });
  await db.collection('bets').deleteMany({});
  await db.collection('transactions').deleteMany({});
  console.log('✅ Test data cleaned');
}

export async function setEventStatus(db, externalId, status, liveScore = null) {
  const update = { status, updatedAt: new Date() };
  if (liveScore) update.liveScore = liveScore;
  return db.collection('events').updateOne({ externalId }, { $set: update });
}

export async function setEventScore(db, externalId, score) {
  return db.collection('events').updateOne(
    { externalId },
    { $set: { liveScore: score, updatedAt: new Date() } }
  );
}

export async function getEvent(db, externalId) {
  return db.collection('events').findOne({ externalId });
}

export async function createTestBet(db, userId, selections, type, stake) {
  const eventIds = selections.map(s => s.eventId);
  const events = await db.collection('events').find({ externalId: { $in: eventIds } }).toArray();
  const eventMap = new Map(events.map(e => [e.externalId, e._id]));

  const totalOdds = type === 'combo'
    ? selections.reduce((acc, s) => acc * s.oddValue, 1)
    : selections[0].oddValue;
  const potentialWin = +(stake * totalOdds).toFixed(2);

  const bet = {
    userId,
    selections: selections.map(s => ({
      ...s,
      eventId: eventMap.get(s.eventId) || s.eventId,
    })),
    type,
    stake,
    totalOdds: +totalOdds.toFixed(3),
    potentialWin,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection('bets').insertOne(bet);
  return { ...bet, _id: result.insertedId };
}

export async function getUserByEmail(db, email) {
  return db.collection('users').findOne({ email });
}

export async function getUserBets(db, userId, status = null) {
  const filter = { userId };
  if (status) filter.status = status;
  return db.collection('bets').find(filter).sort({ createdAt: -1 }).toArray();
}

export async function settleEventViaDB(db, eventExternalId, results) {
  const event = await db.collection('events').findOne({ externalId: eventExternalId });
  if (!event) throw new Error(`Event not found: ${eventExternalId}`);

  // Use the existing settlement service logic
  const bets = await db.collection('bets').find({
    status: 'pending',
    selections: { $elemMatch: { eventId: event._id, outcome: 'pending' } },
  }).toArray();

  for (const bet of bets) {
    let changed = false;
    for (const sel of bet.selections) {
      if (sel.eventId.toString() !== event._id.toString()) continue;
      if (sel.outcome !== 'pending') continue;
      sel.outcome = results[sel.marketType] === sel.oddId ? 'won' : 'lost';
      changed = true;
    }

    if (!changed) continue;

    const anyLost = bet.selections.some(s => s.outcome === 'lost');
    const allWon = bet.selections.every(s => s.outcome === 'won');

    if (bet.status === 'pending' && anyLost) {
      bet.status = 'lost';
      bet.settledAt = new Date();
    } else if (bet.status === 'pending' && allWon) {
      bet.status = 'won';
      bet.settledAt = new Date();

      // Update user balance
      const user = await db.collection('users').findOne({ _id: bet.userId });
      if (user) {
        const newBalance = +(user.balance + bet.potentialWin).toFixed(2);
        await db.collection('users').updateOne({ _id: bet.userId }, { $set: { balance: newBalance } });
        await db.collection('transactions').insertOne({
          userId: bet.userId,
          type: 'win',
          amount: bet.potentialWin,
          balanceBefore: user.balance,
          balanceAfter: newBalance,
          referenceId: bet._id,
          createdAt: new Date(),
        });
      }
    }

    await db.collection('bets').updateOne({ _id: bet._id }, { $set: bet });
  }

  return { settled: bets.filter(b => b.status !== 'pending').length };
}