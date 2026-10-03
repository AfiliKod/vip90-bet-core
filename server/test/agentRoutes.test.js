import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';

describe('Agent routes wiring', () => {
  it('routes/agent.js default export bir Express router', async () => {
    const agentRouter = (await import('../src/routes/agent.js')).default;
    assert.strictEqual(typeof agentRouter, 'function');
    assert.ok(agentRouter.stack.length > 0, 'router boş olmamalı');
  });

  it('GET / route\'u tanımlı', async () => {
    const agentRouter = (await import('../src/routes/agent.js')).default;
    const hasGetRoot = agentRouter.stack.some((layer) => layer.route?.path === '/' && layer.route.methods.get);
    assert.ok(hasGetRoot, 'GET / route\'u bulunamadı');
  });

  it('POST /:agentId/transfer route\'u tanımlı', async () => {
    const agentRouter = (await import('../src/routes/agent.js')).default;
    const hasTransfer = agentRouter.stack.some((layer) => layer.route?.path === '/:agentId/transfer' && layer.route.methods.post);
    assert.ok(hasTransfer, 'transfer route\'u bulunamadı');
  });
});

after(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});
