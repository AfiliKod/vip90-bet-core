import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  optionalTenantId, requireTenantId, adminRoom, clientsRoom, chatRoom, liveRoom,
  cacheKey, cachePrefix, PLATFORM_JOB_REASONS,
} from '../src/tenancy/tenantKeys.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { setDefaultTenantId } from '../src/tenancy/defaultTenantId.js';
import { TenantScopeError } from '../src/tenancy/errors.js';

const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();
const ORIGINAL_MODE = process.env.TENANCY_MODE;

beforeEach(() => {
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(null);
});
after(() => {
  setDefaultTenantId(null);
  if (ORIGINAL_MODE === undefined) delete process.env.TENANCY_MODE;
  else process.env.TENANCY_MODE = ORIGINAL_MODE;
});

describe('tenantKeys', () => {
  it('derives every room from the ambient tenant', async () => {
    await runWithTenant(T1, async () => {
      assert.equal(adminRoom(), `t:${T1}:admin`);
      assert.equal(clientsRoom(), `t:${T1}:clients`);
      assert.equal(chatRoom(null, 'room-1'), `t:${T1}:chat:room-1`);
      assert.equal(liveRoom(null, 'inhouse-crash'), `t:${T1}:live:inhouse-crash`);
    });
  });

  it('explicit tenant wins over the ambient tenant', async () => {
    await runWithTenant(T1, async () => {
      assert.equal(adminRoom(T2), `t:${T2}:admin`);
      assert.equal(optionalTenantId(T2), String(T2));
    });
  });

  it('single mode falls back to the default tenant, then to g: cache keys', async () => {
    setDefaultTenantId(T1);
    assert.equal(adminRoom(), `t:${T1}:admin`);
    assert.equal(cacheKey('mail:event'), `t:${T1}:mail:event`);
    setDefaultTenantId(null);
    assert.equal(optionalTenantId(), null);
    assert.equal(cacheKey('mail:event'), 'g:mail:event');
    assert.equal(cachePrefix(), 'g:');
    assert.throws(() => requireTenantId(), TenantScopeError);
  });

  it('multi mode rejects an unscoped room or cache key', () => {
    process.env.TENANCY_MODE = 'multi';
    assert.throws(() => optionalTenantId(), TenantScopeError);
    assert.throws(() => adminRoom(), TenantScopeError);
    assert.throws(() => cacheKey('popular:15'), TenantScopeError);
  });

  it('rejects empty room identifiers', () => {
    setDefaultTenantId(T1);
    assert.throws(() => chatRoom(null, ''), /roomId/);
    assert.throws(() => liveRoom(null, ''), /gameId/);
  });

  it('exposes stable platform job reasons', () => {
    assert.equal(PLATFORM_JOB_REASONS.EVENT_CLEANUP, 'event-cleanup');
    assert.ok(Object.isFrozen(PLATFORM_JOB_REASONS));
  });
});

it('single mode without a default tenant falls back to today\'s room names (no throw)', async () => {
  const { adminRoom, clientsRoom, chatRoom, LEGACY_ADMIN_ROOM } = await import('../src/tenancy/tenantKeys.js');
  const { setDefaultTenantId } = await import('../src/tenancy/defaultTenantId.js');
  const prev = process.env.TENANCY_MODE;
  process.env.TENANCY_MODE = 'single';
  setDefaultTenantId(null);
  try {
    assert.equal(adminRoom(), LEGACY_ADMIN_ROOM);
    assert.equal(clientsRoom(), null);
    assert.equal(chatRoom(null, 'abc'), 'room:abc');
  } finally {
    if (prev === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = prev;
  }
});
