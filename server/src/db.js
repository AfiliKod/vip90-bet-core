import mongoose from 'mongoose';

// Phase E7 — fail fast, don't buffer commands when disconnected
mongoose.set('bufferCommands', false);

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      // Phase E7 — connection pool tuning
      maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE || '20'),
      minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE || '5'),
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 60000,
    });
    console.log('MongoDB bağlantısı kuruldu (pool: 5-20, bufferCommands: false)');
  } catch (err) {
    console.error('MongoDB bağlantı hatası:', err.message);
    throw err;
  }
}
