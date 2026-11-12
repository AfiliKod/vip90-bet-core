import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRunAsPlatformUsage, checkControllerQueries } from './lint-tenancy.mjs';

test('checkRunAsPlatformUsage permits allow-listed files', () => {
  const code = "import { runAsPlatform } from './context.js'; runAsPlatform('test-reason', fn);";
  const allowedFile = 'server/src/services/tenantDailyStat.js';
  const errors = checkRunAsPlatformUsage(allowedFile, code);
  assert.equal(errors.length, 0);
});

test('checkRunAsPlatformUsage flags unauthorized file usage', () => {
  const code = "import { runAsPlatform } from '../tenancy/context.js'; runAsPlatform('leak', fn);";
  const forbiddenFile = 'server/src/controllers/promotions.js';
  const errors = checkRunAsPlatformUsage(forbiddenFile, code);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /runAsPlatform is not permitted in server\/src\/controllers\/promotions\.js/);
});

test('checkControllerQueries flags bare Model.collection access on tenant models', () => {
  const code = "const users = await User.collection.find({});";
  const file = 'server/src/controllers/testController.js';
  const errors = checkControllerQueries(file, code);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bare collection access prohibited/);
});

test('controller id lookups must use tenantFilter, except catalog models', async () => {
  const { checkControllerQueries } = await import('./lint-tenancy.mjs');
  assert.equal(checkControllerQueries('server/src/controllers/x.js', 'await User.findById(req.params.id)').length, 1);
  assert.equal(checkControllerQueries('server/src/controllers/x.js', 'await User.findOne(tenantFilter(req, { _id: req.params.id }))').length, 0);
  assert.equal(checkControllerQueries('server/src/controllers/x.js', 'await Event.findById(req.params.id)').length, 0);
  assert.equal(checkControllerQueries('server/src/services/x.js', 'await User.findById(req.params.id)').length, 0);
});
