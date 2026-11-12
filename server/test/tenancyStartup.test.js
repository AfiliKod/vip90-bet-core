import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../src/server.js', import.meta.url));

function runServer(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [serverPath], {
      cwd: os.tmpdir(),
      env: {
        PATH: process.env.PATH,
        MONGODB_URI: 'mongodb://127.0.0.1:1/none',
        ...env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Server did not exit within 30 seconds'));
    }, 30_000);
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code, stderr });
    });
  });
}

test('refuses to start in multi mode with a demo flag on', async () => {
  const { code, stderr } = await runServer({ TENANCY_MODE: 'multi', DEMO_BOTS: 'true' });
  assert.equal(code, 1);
  assert.match(stderr, /\[tenancy\].*TENANCY_MODE=multi does not allow DEMO_BOTS=true/);
  assert.match(stderr, /requires JWT_STAFF_SECRET/);
  assert.doesNotMatch(stderr, /DB connection error/);
});

test('refuses to start with an invalid TENANCY_MODE', async () => {
  const { code, stderr } = await runServer({ TENANCY_MODE: 'mulit' });
  assert.equal(code, 1);
  assert.match(stderr, /TENANCY_MODE must be "single" or "multi"/);
});
