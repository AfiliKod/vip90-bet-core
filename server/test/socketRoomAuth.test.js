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

process.env.JWT_SECRET ||= 'test_jwt_secret_socket_room_auth_0123456789abc';

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

  before(async () => {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betzone_test_socket_room_auth');
    await User.deleteMany({});
    admin = await User.create({ username: 'sock_admin', email: 'sock_admin@test.com', password: 'Pass1234', role: 'admin' });
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
    await mongoose.disconnect();
  });

  it('kimliksiz bağlantı admin id\'si göndererek role:admin odasına KATILAMAZ', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, 'role:admin', 'activity:new'), false);
  });

  it('oyuncu token\'ı ile role:admin odasına katılamaz', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id), token: sign(player) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, 'role:admin', 'activity:new'), false);
  });

  it('geçerli admin token\'ı ile role:admin odasına katılır', async () => {
    const c = await connect();
    c.emit('subscribe:admin', { userId: String(admin._id), token: sign(admin) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, 'role:admin', 'activity:new'), true);
  });

  it('başka oyuncunun id\'siyle onun kişisel odasına katılamaz, kendi token\'ıyla kendi odasına katılır', async () => {
    const c = await connect();
    c.emit('subscribe:user', { userId: String(other._id), token: sign(player) });
    await new Promise(r => setTimeout(r, 200));
    assert.equal(await receives(c, `user:${other._id}`, 'balance:update'), false);
    assert.equal(await receives(c, `user:${player._id}`, 'balance:update'), true);
  });
});
