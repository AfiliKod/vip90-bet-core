import { MongoClient } from 'mongodb';
import { spawn } from 'child_process';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test';
const DB_NAME = 'betzone_test';

let mongoClient;

async function waitForMongo(uri, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
      await client.connect();
      await client.close();
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error(`MongoDB not ready at ${uri} after ${timeout}ms`);
}

async function seedTestData(db) {
  const now = new Date();
  const users = db.collection('users');
  const events = db.collection('events');

  // Create unique test user per worker
  const workerId = process.env.TEST_WORKER_ID || 'default';
  const testEmail = `test-${workerId}@betzone.test`;
  const testUsername = `testuser-${workerId}`;

  await users.updateOne(
    { email: testEmail },
    {
      $setOnInsert: {
        email: testEmail,
        username: testUsername,
        password: '$2a$10$3nUWNXXKS87dqY4fpGf/QOlVRJt60JfPA6CxlXfVtDOo10K3OUVBO', // bcrypt hash of 'password123'
        balance: 10000,
        bonusBalance: 0,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  // Clear old test events
  await events.deleteMany({ externalId: /^test-/ });

  // Seed test events
  await events.insertMany([
    // UPCOMING - pre-match
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
      liveScore: { home: 0, away: 0, minute: 0, scope: '' },
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
          label: 'Handikap',
          odds: [
            { id: 'hc1', label: '1 (-1.5)', value: 3.20, isActive: true },
            { id: 'hc2', label: '2 (+1.5)', value: 1.35, isActive: true },
          ],
        },
      ],
    },
    // LIVE - in progress
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
      liveScore: { home: 1, away: 0, minute: 35, scope: 'half' },
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
            { id: 'lou1', label: 'Üst 2.5', value: 1.90, isActive: true },
            { id: 'lou2', label: 'Alt 2.5', value: 1.80, isActive: true },
          ],
        },
      ],
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
      liveScore: { home: 2, away: 1, minute: 90, scope: 'full' },
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
          result: 'fms1',
        },
        {
          type: 'alt_üst',
          label: 'Alt/Üst 2.5',
          odds: [
            { id: 'fou1', label: 'Üst 2.5', value: 1.80, isActive: true },
            { id: 'fou2', label: 'Alt 2.5', value: 1.90, isActive: true },
          ],
          result: 'fou1',
        },
      ],
    },
    // Additional LIVE event for combo testing
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
    },
  ]);

  console.log(`✅ Test data seeded for worker: ${workerId}`);
}

export default async function globalSetup() {
  console.log('🚀 Starting global test setup...');

  await waitForMongo(MONGODB_URI);

  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db(DB_NAME);

  await seedTestData(db);

  // Store client for teardown
  global.__MONGO_CLIENT__ = mongoClient;

  // Ensure server is reachable
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${process.env.E2E_BASE_URL || 'http://localhost:5173'}/`);
      if (res.ok) break;
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('✅ Global setup complete');
}

export async function teardown() {
  if (global.__MONGO_CLIENT__) {
    await global.__MONGO_CLIENT__.close();
  }
}