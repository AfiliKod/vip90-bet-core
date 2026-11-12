/**
 * Socket.IO kişisel/admin odaları — eskiden sunucu istemcinin gönderdiği
 * userId'ye güveniyordu; bir admin'in id'sini bilen kimliksiz bir bağlantı
 * 'role:admin' odasına katılıp tüm yatırma/çekme/KYC olaylarını dinleyebiliyordu.
 *
 * Çalıştırmak için: node --test test/socketRoomAuth.test.js
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import User from '../src/models/User.js';
import { initSocket } from '../src/socket/handler.js';
import Role from '../src/models/Role.js';
import { initDefaultPermissions, initDefaultRoles } from '../src/services/permissions.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { adminRoom } from '../src/tenancy/tenantKeys.js';

process.env.JWT_SECRET ||= 'test_jwt_secret_socket_room_auth_0123456789abc';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

describe('Socket oda yetkilendirmesi', () => {
  let httpServer; let io; let url; let admin; let player; let other;
  const clients = [];
  const sign = (u) => jwt.sign({ id: u._id, role: u.role, tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const connect = async () => {
    const c = ioClient(url, { transports: ['websocket'], forceNew: true });
    clients.push(c);
    await new Promise((res) => c.on('connect', res));
    return c;
  };
  /** Odaya yayın yap, istemcinin alıp almadığını döndür. */
  const receives = async (c, room, event) => {
    const got = new Promise((res) => { c.once(event, () => res(true)); setTimeout(() => res(false), 400); });
    io.to(room).emit(event, { probe: true });
    return got;
  };
  /** Predicate true olana kadar yokla; tam yükte katılım 200 ms'den uzun sürebilir. */
  const waitFor = async (predicate, { timeoutMs = 3000, intervalMs = 25 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await predicate()) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  };

  before(async () => {
    await mongoose.connect(process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip7_t3');
    setDefaultTenantId(T1);
    await User.deleteMany({});
    // V5: joining role:admin needs admin:activity:read, so the admin holds super_admin.
    await initDefaultPermissions();
    await initDefaultRoles();
    const sup = await Role.findOne({ name: 'super_admin' });
    admin = await User.create({ username: 'sock_admin', email: 'sock_admin@test.com', password: 'Pass1234', role: 'admin', roles: [sup._id] });
    player = await User.create({ username: 'sock_player', email: 'sock_player@test.com', password: 'Pass1234' });
    other = await User.create({ username: 'sock_other', email: 'sock_other@test.com', password: 'Pass1234' });
    httpServer = http.createServer();
    io = new Server(httpServer);
    initSocket(io);
    await new Promise((res) => httpServer.listen(0, '127.0.0.1', res));
    url = `http://127.0.0.1:${httpServer.address().port}`;
  });

  after(async () => {
    for (const c of clients) c.close();
    io.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    setDefaultTenantId(null);
  });

  it('kimliksiz bağlantı admin id\'si göndererek role:admin odasına KATILAMAZ', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, adminRoom(T1), 'activity:new'), false);
  });

  it('oyuncu token\'ı ile role:admin odasına katılamaz', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id), token: sign(player) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, adminRoom(T1), 'activity:new'), false);
  });

  it('geçerli admin token\'ı ile role:admin odasına katılır', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id), token: sign(admin) });
    assert.equal(await waitFor(() => receives(c, adminRoom(T1), 'activity:new')), true);
  });

  it('başka kiracının admin odasına katılamaz', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { token: sign(admin) });
    await waitFor(() => receives(c, adminRoom(T1), 'activity:new'));
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, adminRoom(T2), 'activity:new'), false);
  });

  it('başka oyuncunun id\'siyle onun kişisel odasına katılamaz, kendi token\'ıyla kendi odasına katılır', async () => {
    const c = await connect();
    c.emit('subscribe:user', { userId: String(other._id), token: sign(player) });
    assert.equal(await waitFor(() => receives(c, `user:${player._id}`, 'balance:update')), true);
    // Yoklama yokluğu kanıtlayamaz: odaya katılmama için sabit bekleme korunuyor.
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, `user:${other._id}`, 'balance:update'), false);
  });
});
