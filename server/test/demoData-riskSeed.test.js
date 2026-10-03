// server/test/demoData-riskSeed.test.js
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import RiskEvaluation from '../src/models/RiskEvaluation.js';
import RiskFinding from '../src/models/RiskFinding.js';
import RiskRule from '../src/models/RiskRule.js';
import ActivityEvent from '../src/models/ActivityEvent.js';
import { _setIOGetter, _getIOGetter } from '../src/services/activityFeed.js';
import * as riskSeed from '../src/services/demoData/riskSeed.js';

const ORIGINAL_IO_GETTER = _getIOGetter();

describe('demoData/riskSeed', () => {
  before(async () => {
    _setIOGetter(() => null);
    await mongoose.connect('mongodb://localhost:27017/betzone_test_demo_data_risk');
  });
  after(async () => {
    _setIOGetter(ORIGINAL_IO_GETTER);
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    _setIOGetter(() => null);
    await User.deleteMany({});
    await RiskEvaluation.deleteMany({});
    await RiskFinding.deleteMany({});
    await RiskRule.deleteMany({});
    await ActivityEvent.deleteMany({});
  });

  it('load(N) gerçek evaluateRisk ile N RiskEvaluation + eşlik eden RiskFinding üretir', async () => {
    const result = await riskSeed.load(15);
    assert.equal(result.created, 15);
    assert.equal(await RiskEvaluation.countDocuments({ isSeed: true }), 15);
    assert.equal(await RiskFinding.countDocuments({ isSeed: true }), 15);
    assert.ok(await RiskRule.countDocuments() >= 6, 'varsayılan kural seti yüklenmiş olmalı');
    // Her evaluation gerçek kural eşleşmesinden gelmeli
    const evalsWithFindings = await RiskEvaluation.countDocuments({ isSeed: true, 'findings.0': { $exists: true } });
    assert.equal(evalsWithFindings, 15);
  });

  it('insertMany backfill hiç ActivityEvent üretmez', async () => {
    await riskSeed.load(10);
    assert.equal(await ActivityEvent.countDocuments({}), 0);
  });

  it('clear() değerlendirmeleri ve bulguları siler', async () => {
    await riskSeed.load(5);
    const result = await riskSeed.clear();
    assert.equal(result.deleted, 5);
    assert.equal(result.findingsDeleted, 5);
  });

  it('liveTick() risk_flag ActivityEvent\'ini manuel tetikler', async () => {
    await riskSeed.load(1);
    const result = await riskSeed.liveTick();
    assert.ok(result);
    const events = await ActivityEvent.find({ type: 'risk_flag', userId: result.userId });
    assert.equal(events.length, 1);
  });
});
