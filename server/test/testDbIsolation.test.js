import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isolateUri } from './helpers/await-model-indexes.mjs';

test('isolateUri appends the suffix to the database name and keeps the query string', () => {
  assert.equal(isolateUri('mongodb://localhost:27017/betzone_test_chat', '_wabc'), 'mongodb://localhost:27017/betzone_test_chat_wabc');
  assert.equal(
    isolateUri('mongodb://127.0.0.1:27017/betzone_test_rg_conc?replicaSet=rs0', '_wabc'),
    'mongodb://127.0.0.1:27017/betzone_test_rg_conc_wabc?replicaSet=rs0',
  );
});

test('isolateUri leaves URIs alone when there is no suffix, no database or it is already suffixed', () => {
  assert.equal(isolateUri('mongodb://localhost:27017/x', ''), 'mongodb://localhost:27017/x');
  assert.equal(isolateUri('mongodb://localhost:27017/', '_wabc'), 'mongodb://localhost:27017/');
  assert.equal(isolateUri('mongodb://localhost:27017/x_wabc', '_wabc'), 'mongodb://localhost:27017/x_wabc');
});
