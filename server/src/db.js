import mongoose from 'mongoose';

export async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB bağlantısı kuruldu');
  } catch (err) {
    console.error('MongoDB bağlantı hatası:', err.message);
    throw err;
  }
}
