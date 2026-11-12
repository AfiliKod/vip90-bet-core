import test from 'node:test';
import assert from 'node:assert/strict';
import { usePlatformAuthStore } from '../src/store/authStore.js';

test('authStore initial state is unauthenticated', () => {
  const state = usePlatformAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.requires2fa, false);
  assert.equal(state.requires2faSetup, false);
});

test('authStore handleLoginResponse transitions to requires2faSetup when multi-mode setupToken received', () => {
  usePlatformAuthStore.getState().handleLoginResponse({
    requires2faSetup: true,
    setupToken: 'sample-setup-token',
  });

  const state = usePlatformAuthStore.getState();
  assert.equal(state.requires2faSetup, true);
  assert.equal(state.setupToken, 'sample-setup-token');
});

test('authStore handleLoginResponse transitions to requires2fa when challengeToken received', () => {
  usePlatformAuthStore.getState().handleLoginResponse({
    requires2fa: true,
    challengeToken: 'sample-challenge-token',
  });

  const state = usePlatformAuthStore.getState();
  assert.equal(state.requires2fa, true);
  assert.equal(state.challengeToken, 'sample-challenge-token');
  assert.equal(state.requires2faSetup, false);
  assert.equal(state.isAuthenticated, false);
});

test('authStore handleLoginResponse sets session when accessToken received', () => {
  usePlatformAuthStore.getState().handleLoginResponse({
    accessToken: 'sample-access-token',
    staff: { id: 'staff_1', email: 'owner@example.com', username: 'owner' },
  });

  const state = usePlatformAuthStore.getState();
  assert.equal(state.isAuthenticated, true);
  assert.equal(state.accessToken, 'sample-access-token');
  assert.equal(state.staff?.email, 'owner@example.com');
  assert.equal(state.requires2fa, false);
  assert.equal(state.requires2faSetup, false);
});

test('authStore logout resets state to unauthenticated', () => {
  usePlatformAuthStore.getState().logout();

  const state = usePlatformAuthStore.getState();
  assert.equal(state.isAuthenticated, false);
  assert.equal(state.accessToken, null);
  assert.equal(state.staff, null);
  assert.equal(state.requires2fa, false);
  assert.equal(state.requires2faSetup, false);
  assert.equal(state.challengeToken, null);
  assert.equal(state.setupToken, null);
});
