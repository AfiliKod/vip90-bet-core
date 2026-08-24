import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import ChatRoom from '../src/models/ChatRoom.js';
import ChatMessage from '../src/models/ChatMessage.js';
import ChatTip from '../src/models/ChatTip.js';
import ChatRain from '../src/models/ChatRain.js';
import Transaction from '../src/models/Transaction.js';
import { setIO } from '../src/services/socketEmitter.js';
import {
  createRoom, getRoomBySlug, updateRoom, sendMessage, getRoomMessages,
  banUserFromRoom, muteUserInRoom, sendTip, createRain, initChatSocket,
} from '../src/services/chat.js';

/** createRain'in fetchSockets() ile "aktif kullanıcı" sorguladığı /chat namespace'ini simüle eder. */
function createMockIoWithActiveUsers(userIds) {
  const sockets = userIds.map(id => ({ user: { id } }));
  return {
    of: () => ({ in: () => ({ fetchSockets: async () => sockets }), to: () => ({ emit: () => {} }) }),
    to: () => ({ emit: () => {} }),
  };
}

const DB_URI = process.env.MONGODB_URI_CHAT_TEST || 'mongodb://localhost:27017/betzone_test_chat';

before(async () => {
  await mongoose.connect(DB_URI);
});

after(async () => {
  setIO(null);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
  await ChatRoom.deleteMany({});
  await ChatMessage.deleteMany({});
  await ChatTip.deleteMany({});
  await ChatRain.deleteMany({});
  await Transaction.deleteMany({});
});

async function makeUser(username, balance = 0) {
  return User.create({ username, email: `${username}@x.com`, password: 'password123', balance });
}

describe('Bug fix — require/import (ESM)', () => {
  it('initChatSocket auth middleware jwt.verify çağırırken "require is not defined" hatası fırlatmaz', () => {
    // Regresyon testi: services/chat.js'te önceden `const jwt = require('jsonwebtoken')`
    // kullanılıyordu — server "type":"module" olduğu için bu satır ReferenceError
    // fırlatırdı ve /chat namespace'inin auth middleware'i HER bağlantıda patlardı.
    const fakeIo = { of: () => ({ use: (fn) => { fakeIo._middleware = fn; }, on: () => {} }) };
    assert.doesNotThrow(() => initChatSocket(fakeIo));

    let calledNext = null;
    const socket = { handshake: { auth: { token: 'not-a-real-token' } } };
    assert.doesNotThrow(() => {
      fakeIo._middleware(socket, (err) => { calledNext = err; });
    });
    // Geçersiz token → auth hatası ile next çağrılmalı, ama ReferenceError değil.
    assert.ok(calledNext instanceof Error);
    assert.equal(calledNext.message, 'auth');
  });
});

describe('Bug fix — sendTip atomic bakiye kontrolü', () => {
  it('eşzamanlı iki bahşiş isteğinde, bakiye yalnızca birini karşılıyorsa yalnızca biri başarılı olur', async () => {
    const from = await makeUser('gonderen', 100);
    const to1 = await makeUser('alici1');
    const to2 = await makeUser('alici2');
    const room = await createRoom({ name: 'Genel', description: '', icon: '💬', color: '#000' }, from._id);

    // Bakiye 100, her ikisi de 100 istiyor — yalnızca biri başarılı olmalı.
    const results = await Promise.allSettled([
      sendTip(from._id, to1._id, room._id, 100, ''),
      sendTip(from._id, to2._id, room._id, 100, ''),
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');
    assert.equal(succeeded.length, 1, 'yalnızca bir bahşiş başarılı olmalı');
    assert.equal(failed.length, 1, 'diğeri yetersiz bakiyeden reddedilmeli');

    const finalFrom = await User.findById(from._id);
    assert.equal(finalFrom.balance, 0, 'gönderenin bakiyesi tam olarak sıfırlanmalı (çift düşüş olmamalı)');
  });

  it('yetersiz bakiyede tek bir istek de reddedilir, kimsenin bakiyesi değişmez', async () => {
    const from = await makeUser('fakir', 10);
    const to = await makeUser('zengin');
    const room = await createRoom({ name: 'Genel2', description: '', icon: '💬', color: '#000' }, from._id);

    await assert.rejects(() => sendTip(from._id, to._id, room._id, 50, ''));

    assert.equal((await User.findById(from._id)).balance, 10);
    assert.equal((await User.findById(to._id)).balance, 0);
  });

  it('başarılı bahşişte gönderen düşer, alıcı artar, transaction çift kayıt oluşur', async () => {
    const from = await makeUser('gonderen2', 100);
    const to = await makeUser('alici3');
    const room = await createRoom({ name: 'Genel3', description: '', icon: '💬', color: '#000' }, from._id);

    const tip = await sendTip(from._id, to._id, room._id, 30, 'iyi oyun');

    assert.equal((await User.findById(from._id)).balance, 70);
    assert.equal((await User.findById(to._id)).balance, 30);
    assert.equal(tip.amount, 30);

    const txs = await Transaction.find({}).sort({ createdAt: 1 });
    assert.equal(txs.length, 2);
    assert.equal(txs[0].type, 'tip_sent');
    assert.equal(txs[1].type, 'tip_received');
  });

  it('kendine bahşiş gönderilemez', async () => {
    const user = await makeUser('kendine', 100);
    const room = await createRoom({ name: 'Genel4', description: '', icon: '💬', color: '#000' }, user._id);
    await assert.rejects(() => sendTip(user._id, user._id, room._id, 10, ''));
  });
});

describe('createRoom / getRoomBySlug / updateRoom', () => {
  it('oda oluşturur, slug otomatik üretilir', async () => {
    const admin = await makeUser('admin1');
    const room = await createRoom({ name: 'Genel Sohbet', description: 'x', icon: '💬', color: '#000' }, admin._id);
    assert.equal(room.slug, 'genel-sohbet');
    assert.equal(room.isActive, true);
  });

  it('aynı isimle ikinci oda oluşturulamaz', async () => {
    const admin = await makeUser('admin2');
    await createRoom({ name: 'Tekil Oda', description: '', icon: '💬', color: '#000' }, admin._id);
    await assert.rejects(() => createRoom({ name: 'Tekil Oda', description: '', icon: '💬', color: '#000' }, admin._id));
  });

  it('getRoomBySlug yalnızca aktif odayı döner', async () => {
    const admin = await makeUser('admin3');
    const room = await createRoom({ name: 'Aktif Oda', description: '', icon: '💬', color: '#000' }, admin._id);
    await updateRoom(room._id, { isActive: false });
    const found = await getRoomBySlug('aktif-oda');
    assert.equal(found, null);
  });
});

describe('sendMessage — moderasyon', () => {
  it('yasaklı kullanıcı mesaj gönderemez', async () => {
    const admin = await makeUser('admin4');
    const player = await makeUser('yasakli1');
    const room = await createRoom({ name: 'Mod Oda', description: '', icon: '💬', color: '#000' }, admin._id);
    await banUserFromRoom(room._id, player._id, admin._id);
    await assert.rejects(() => sendMessage(player._id, room._id, 'merhaba'));
  });

  it('susturulmuş kullanıcı mesaj gönderemez', async () => {
    const admin = await makeUser('admin5');
    const player = await makeUser('susmus1');
    const room = await createRoom({ name: 'Mod Oda2', description: '', icon: '💬', color: '#000' }, admin._id);
    await muteUserInRoom(room._id, player._id, 60, 'spam', admin._id);
    await assert.rejects(() => sendMessage(player._id, room._id, 'merhaba'));
  });

  it('normal kullanıcı mesaj gönderebilir ve listelenir', async () => {
    const admin = await makeUser('admin6');
    const player = await makeUser('normal1');
    const room = await createRoom({ name: 'Mod Oda3', description: '', icon: '💬', color: '#000' }, admin._id);
    await sendMessage(player._id, room._id, 'selam herkese');
    const { messages, total } = await getRoomMessages(room._id);
    assert.equal(total, 1);
    assert.equal(messages[0].message, 'selam herkese');
  });
});

describe('Bug fix — createRain array-create (Model.create([{...}]) döner)', () => {
  it('yeterli aktif kullanıcıyla yağmur dağıtımı tamamlanır, alıcıların bakiyesi artar', async () => {
    const admin = await makeUser('rainadmin');
    const r1 = await makeUser('rainrecipient1', 0);
    const r2 = await makeUser('rainrecipient2', 0);
    const room = await createRoom({ name: 'Yağmur Odası', description: '', icon: '💬', color: '#000' }, admin._id);
    await updateRoom(room._id, { rainMinUsers: 2, rainMinAmount: 1 });

    setIO(createMockIoWithActiveUsers([String(r1._id), String(r2._id)]));

    // Regresyon testi: önceki bug'da `rain.recipients.push(...)` satırı
    // "Cannot read properties of undefined (reading 'push')" ile patlıyordu
    // çünkü rain bir array'di (Model.create([{...}]) deseni).
    const rain = await createRain(room._id, admin._id, { totalAmount: 10 });

    assert.equal(rain.status, 'completed');
    assert.equal(rain.recipients.length, 2);

    const total = (await User.findById(r1._id)).balance + (await User.findById(r2._id)).balance;
    assert.equal(total, 10);
  });

  it('yetersiz aktif kullanıcıda yağmur reddedilir', async () => {
    const admin = await makeUser('rainadmin2');
    const room = await createRoom({ name: 'Yağmur Odası2', description: '', icon: '💬', color: '#000' }, admin._id);
    await updateRoom(room._id, { rainMinUsers: 3 });

    setIO(createMockIoWithActiveUsers([String(admin._id)])); // yalnızca 1 aktif kullanıcı, 3 gerekli

    await assert.rejects(() => createRain(room._id, admin._id, { totalAmount: 10 }));
  });
});
