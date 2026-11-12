import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  createSocketTenantResolver, socketTenantMiddleware, socketPacketTenant,
} from '../src/socket/tenant.js';
import { getCurrentTenantId } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;

function fakeSocket({ host = 't1.test', auth = {} } = {}) {
  return {
    handshake: { headers: { host }, auth },
    data: {},
    request: {},
  };
}

beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(null);
});
after(() => {
  setDefaultTenantId(null);
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});

describe('socket tenant resolver', () => {
  it('uses the default tenant in single mode', async () => {
    setDefaultTenantId(T1);
    const resolve = createSocketTenantResolver({ mode: () => 'single', defaultTenantId: () => T1 });
    const tenant = await resolve(fakeSocket());
    assert.equal(String(tenant.id), String(T1));
  });

  it('uses the Host lookup in multi mode', async () => {
    const resolve = createSocketTenantResolver({
      mode: () => 'multi',
      findByHost: async (host) => (host === 't2.test' ? { id: String(T2), brandId: null, host } : null),
    });
    assert.equal(String((await resolve(fakeSocket({ host: 't2.test' }))).id), String(T2));
    assert.equal(await resolve(fakeSocket({ host: 'unknown.test' })), null);
  });
});

describe('socket tenant middleware', () => {
  it('binds the tenant on the socket and runs next inside the tenant context', async () => {
    setDefaultTenantId(T1);
    const socket = fakeSocket();
    const middleware = socketTenantMiddleware(createSocketTenantResolver({
      mode: () => 'single', defaultTenantId: () => T1,
    }));
    let ambient = null;
    await middleware(socket, (error) => {
      assert.equal(error, undefined);
      ambient = getCurrentTenantId();
    });
    assert.equal(String(socket.request.tenant.id), String(T1));
    assert.equal(socket.data.tenantId, String(T1));
    assert.equal(String(ambient), String(T1));
  });

  it('rejects a socket whose host has no tenant in multi mode', async () => {
    const middleware = socketTenantMiddleware(createSocketTenantResolver({
      mode: () => 'multi', findByHost: async () => null,
    }));
    let error = null;
    const prev = process.env.TENANCY_MODE; process.env.TENANCY_MODE = 'multi';
    try { await middleware(fakeSocket({ host: 'unknown.test' }), (e) => { error = e; }); }
    finally { if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev; }
    assert.equal(error.message, 'tenant');
  });

  it('re-enters the tenant context for every packet', async () => {
    const socket = fakeSocket();
    socket.data.tenantId = String(T2);
    let ambient = null;
    await socketPacketTenant(socket, () => { ambient = getCurrentTenantId(); });
    assert.equal(String(ambient), String(T2));
  });

  it('rejects a packet when the socket has no bound tenant', async () => {
    let error = null;
    const prev = process.env.TENANCY_MODE; process.env.TENANCY_MODE = 'multi';
    try { await socketPacketTenant(fakeSocket(), (e) => { error = e; }); }
    finally { if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev; }
    assert.equal(error.message, 'tenant');
  });

  it('single mode without a default tenant: the connection proceeds unbound (no tenant error)', async () => {
    const { socketTenantMiddleware } = await import('../src/socket/tenant.js');
    const prev = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = 'single';
    try {
      const mw = socketTenantMiddleware(async () => null);
      const socket = { handshake: { headers: { host: 'localhost:3000' } }, data: {} };
      let err = 'unset';
      await mw(socket, (e) => { err = e; });
      assert.equal(err, undefined);
      assert.equal(socket.data.tenantId, undefined);
    } finally {
      if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev;
    }
  });
});
