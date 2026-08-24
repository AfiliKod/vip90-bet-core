import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Ticket from '../src/models/Ticket.js';
import { createTicket, addMessage, updateStatus } from '../src/services/ticket.js';
import { setIO } from '../src/services/socketEmitter.js';

// ticket.test.js ile AYNI DB'yi paylaşmamalı — node --test dosyaları paralel
// çalıştırdığında beforeEach temizlikleri çakışıp "duplicate key" hatası verir.
const DB_URI = process.env.MONGODB_URI_TICKET_NOTIF_TEST || 'mongodb://localhost:27017/betzone_test_ticket_notif';

/** Gerçek socket.io yerine emit çağrılarını kaydeden basit bir sahte io. */
function createMockIo() {
  const calls = [];
  const io = {
    to(room) {
      return { emit: (event, payload) => calls.push({ room, event, payload }) };
    },
  };
  return { io, calls };
}

before(async () => {
  await mongoose.connect(DB_URI);
});

after(async () => {
  setIO(null);
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Ticket.deleteMany({});
});

async function makeUser(username) {
  return User.create({ username, email: `${username}@x.com`, password: 'password123' });
}

describe('ticket bildirimleri (socket)', () => {
  test('createTicket admin odasına ticket:new emit eder', async () => {
    const { io, calls } = createMockIo();
    setIO(io);

    const player = await makeUser('oyuncu1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');

    const adminEvent = calls.find(c => c.room === 'role:admin' && c.event === 'ticket:new');
    assert.ok(adminEvent, 'ticket:new admin odasına emit edilmeli');
    assert.equal(String(adminEvent.payload.ticketId), String(ticket._id));
    assert.equal(adminEvent.payload.subject, 'Konu');
  });

  test('addMessage (admin) kullanıcı odasına ticket:reply emit eder', async () => {
    const player = await makeUser('oyuncu1');
    const admin = await makeUser('admin1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');

    const { io, calls } = createMockIo();
    setIO(io);
    await addMessage(ticket._id, admin._id, 'admin', 'Yanıt');

    const userEvent = calls.find(c => c.room === `user:${player._id}` && c.event === 'ticket:reply');
    assert.ok(userEvent, 'admin yanıtlayınca ticket:reply oyuncu odasına emit edilmeli');
  });

  test('addMessage (player) bildirim emit etmez', async () => {
    const player = await makeUser('oyuncu1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');

    const { io, calls } = createMockIo();
    setIO(io);
    await addMessage(ticket._id, player._id, 'player', 'Ek bilgi');

    assert.equal(calls.length, 0, 'oyuncu kendi tiketine yazınca bildirim tetiklenmemeli');
  });

  test('updateStatus kullanıcı odasına ticket:status emit eder', async () => {
    const player = await makeUser('oyuncu1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');

    const { io, calls } = createMockIo();
    setIO(io);
    await updateStatus(ticket._id, 'resolved');

    const statusEvent = calls.find(c => c.room === `user:${player._id}` && c.event === 'ticket:status');
    assert.ok(statusEvent);
    assert.equal(statusEvent.payload.status, 'resolved');
  });

  test('getIO() null dönerse (io hiç set edilmemiş) hiçbir şey patlamaz', async () => {
    setIO(null);
    const player = await makeUser('oyuncu1');
    // createTicket/addMessage/updateStatus io olmadan da hatasız tamamlanmalı
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');
    await addMessage(ticket._id, player._id, 'player', 'x');
    const updated = await updateStatus(ticket._id, 'closed');
    assert.equal(updated.status, 'closed');
  });
});
