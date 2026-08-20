import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Ticket from '../src/models/Ticket.js';
import {
  createTicket, addMessage, updateStatus, getMyTickets, getAllTickets, getTicketById,
} from '../src/services/ticket.js';

// Benzersiz test DB — paylaşımlı 'betzone_test' ile diğer dosyaların
// çakışmaması için (bilinen izolasyon sorunu, bkz. CHANGELOG D5 notu).
// after()'da dropDatabase()/disconnect() YOK — beforeEach zaten temizler,
// başka bir dosyayla birlikte çalıştırıldığında onu bozmaz.
const DB_URI = process.env.MONGODB_URI_TICKET_TEST || 'mongodb://localhost:27017/betzone_test_ticket';

before(async () => {
  await mongoose.connect(DB_URI);
});

// Bağlantıyı kapatmazsak process event loop'ta asılı kalır — bu betzone_test_ticket
// KENDİNE ÖZGÜ (benzersiz) bir DB, başka dosyayla paylaşılmıyor, o yüzden burada
// dropDatabase()+disconnect() güvenli (O1-O3'teki sorun PAYLAŞIMLI DB'de yaşanıyordu).
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Ticket.deleteMany({});
});

async function makeUser(username = 'oyuncu1') {
  return User.create({ username, email: `${username}@x.com`, password: 'password123' });
}

describe('createTicket', () => {
  test('oyuncu talep açar, ilk mesaj kaydedilir, status open', async () => {
    const user = await makeUser();
    const ticket = await createTicket(user._id, 'Para çekme gecikti', 'Merhaba, 2 gündür bekliyorum');
    assert.strictEqual(ticket.status, 'open');
    assert.strictEqual(ticket.subject, 'Para çekme gecikti');
    assert.strictEqual(ticket.messages.length, 1);
    assert.strictEqual(ticket.messages[0].senderRole, 'player');
    assert.strictEqual(String(ticket.messages[0].senderId), String(user._id));
  });

  test('konu veya ilk mesaj boşsa reddedilir', async () => {
    const user = await makeUser();
    await assert.rejects(() => createTicket(user._id, '', 'mesaj'));
    await assert.rejects(() => createTicket(user._id, 'konu', ''));
  });
});

describe('addMessage', () => {
  test('operatör yanıtlarsa mesaj eklenir VE status open ise in_progress’e geçer', async () => {
    const player = await makeUser('oyuncu1');
    const admin = await makeUser('admin1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');
    const updated = await addMessage(ticket._id, admin._id, 'admin', 'İnceliyoruz');
    assert.strictEqual(updated.messages.length, 2);
    assert.strictEqual(updated.status, 'in_progress');
  });

  test('oyuncu resolved bir tikete yazarsa yeniden open olur', async () => {
    const player = await makeUser('oyuncu1');
    const admin = await makeUser('admin1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');
    await updateStatus(ticket._id, 'resolved');
    const updated = await addMessage(ticket._id, player._id, 'player', 'Hala çözülmedi');
    assert.strictEqual(updated.status, 'open');
  });

  test('operatör closed bir tikete yazarsa status DEĞİŞMEZ — kapalı tiket sessizce yeniden açılmaz', async () => {
    const player = await makeUser('oyuncu1');
    const admin = await makeUser('admin1');
    const ticket = await createTicket(player._id, 'Konu', 'İlk mesaj');
    await updateStatus(ticket._id, 'closed');
    const updated = await addMessage(ticket._id, admin._id, 'admin', 'not');
    assert.strictEqual(updated.status, 'closed');
  });

  test('var olmayan tikete mesaj eklenemez', async () => {
    const player = await makeUser();
    const fakeId = new mongoose.Types.ObjectId();
    await assert.rejects(() => addMessage(fakeId, player._id, 'player', 'x'));
  });
});

describe('updateStatus', () => {
  test('geçerli bir statüye geçirir', async () => {
    const player = await makeUser();
    const ticket = await createTicket(player._id, 'Konu', 'Mesaj');
    const updated = await updateStatus(ticket._id, 'resolved');
    assert.strictEqual(updated.status, 'resolved');
  });

  test('geçersiz statü reddedilir', async () => {
    const player = await makeUser();
    const ticket = await createTicket(player._id, 'Konu', 'Mesaj');
    await assert.rejects(() => updateStatus(ticket._id, 'archived'));
  });
});

describe('getMyTickets / getAllTickets / getTicketById', () => {
  test('getMyTickets yalnızca kendi tiketlerini döner, en yeni önce', async () => {
    const p1 = await makeUser('oyuncu1');
    const p2 = await makeUser('oyuncu2');
    await createTicket(p1._id, 'A', 'x');
    await createTicket(p2._id, 'B', 'y');
    const mine = await getMyTickets(p1._id);
    assert.strictEqual(mine.length, 1);
    assert.strictEqual(mine[0].subject, 'A');
  });

  test('getAllTickets tüm tiketleri döner, status filtresi çalışır', async () => {
    const p1 = await makeUser('oyuncu1');
    const t1 = await createTicket(p1._id, 'A', 'x');
    await createTicket(p1._id, 'B', 'y');
    await updateStatus(t1._id, 'resolved');
    const open = await getAllTickets({ status: 'open' });
    assert.strictEqual(open.length, 1);
    assert.strictEqual(open[0].subject, 'B');
  });

  test('getTicketById sahibi görebilir', async () => {
    const p1 = await makeUser('oyuncu1');
    const ticket = await createTicket(p1._id, 'A', 'x');
    const found = await getTicketById(ticket._id, p1._id, false);
    assert.strictEqual(String(found._id), String(ticket._id));
  });

  test('getTicketById başka oyuncu görüntüleyemez (admin değilse)', async () => {
    const p1 = await makeUser('oyuncu1');
    const p2 = await makeUser('oyuncu2');
    const ticket = await createTicket(p1._id, 'A', 'x');
    await assert.rejects(() => getTicketById(ticket._id, p2._id, false));
  });

  test('getTicketById admin herhangi bir tiketi görebilir', async () => {
    const p1 = await makeUser('oyuncu1');
    const admin = await makeUser('admin1');
    const ticket = await createTicket(p1._id, 'A', 'x');
    const found = await getTicketById(ticket._id, admin._id, true);
    assert.strictEqual(String(found._id), String(ticket._id));
  });
});
