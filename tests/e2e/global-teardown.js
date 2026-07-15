import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test';
const DB_NAME = 'betzone_test';

export default async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    // Clean up test data
    await db.collection('users').deleteMany({ email: /^test-.*@betzone\.test$/ });
    await db.collection('events').deleteMany({ externalId: /^test-/ });
    await db.collection('bets').deleteMany({});
    await db.collection('transactions').deleteMany({});

    await client.close();
    console.log('✅ Test data cleaned up');
  } catch (err) {
    console.error('⚠️ Teardown error:', err.message);
  }

  console.log('✅ Global teardown complete');
}