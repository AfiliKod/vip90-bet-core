import 'dotenv/config';
import mongoose from 'mongoose';
import User from './models/User.js';

await mongoose.connect(process.env.MONGODB_URI);

await User.deleteMany({});
await User.create({
  username: 'admin',
  email: 'admin@vipbet.com',
  password: 'Admin1234!',
  role: 'admin',
  balance: 0,
});

console.log('✅ Admin kullanıcısı oluşturuldu (admin / Admin1234!)');
await mongoose.disconnect();
