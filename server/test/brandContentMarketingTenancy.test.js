import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Brand from '../src/models/Brand.js';
import StaticPage from '../src/models/StaticPage.js';
import Promotion from '../src/models/Promotion.js';
import VipLevel from '../src/models/VipLevel.js';
import PlayerSegment from '../src/models/PlayerSegment.js';
import SmsTemplate from '../src/models/SmsTemplate.js';
import SmsSender from '../src/models/SmsSender.js';
import SmsLog from '../src/models/SmsLog.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import SystemMailLog from '../src/models/SystemMailLog.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { listTenantIndexes } from '../src/tenancy/indexRegistry.js';
import { isTenantCollection } from '../src/tenancy/tenantScoped.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip2_t5';
const T1 = new mongoose.Types.ObjectId();
const B1 = new mongoose.Types.ObjectId();
const savedEnforcement = process.env.TENANCY_ENFORCEMENT;

const MODELS = {
  Brand,
  StaticPage,
  Promotion,
  VipLevel,
  PlayerSegment,
  SmsTemplate,
  SmsSender,
  SmsLog,
  SystemMailTemplate,
  SystemMailLog,
};

const EXPECTED_INDEXES = {
  Brand: [
    { keys: { tenantId: 1, slug: 1 }, options: { unique: true, name: 'tenant_slug_uniq' } },
    { keys: { tenantId: 1, isActive: 1 }, options: { name: 'tenant_isActive' } },
  ],
  StaticPage: [
    { keys: { tenantId: 1, brandId: 1, slug: 1 }, options: { unique: true, name: 'tenant_brandId_slug_uniq' } },
  ],
  Promotion: [
    { keys: { tenantId: 1, title: 1 }, options: { name: 'tenant_title' } },
    { keys: { tenantId: 1, isActive: 1, claimedBy: 1 }, options: { name: 'tenant_isActive_claimedBy' } },
    { keys: { tenantId: 1, expiresAt: 1 }, options: { name: 'tenant_expiresAt' } },
  ],
  VipLevel: [
    { keys: { tenantId: 1, level: 1 }, options: { unique: true, name: 'tenant_level_uniq' } },
    { keys: { tenantId: 1, xpRequired: 1 }, options: { name: 'tenant_xpRequired' } },
  ],
  PlayerSegment: [
    { keys: { tenantId: 1, slug: 1 }, options: { unique: true, name: 'tenant_slug_uniq' } },
  ],
  SmsTemplate: [
    { keys: { tenantId: 1, key: 1 }, options: { unique: true, name: 'tenant_key_uniq' } },
    { keys: { tenantId: 1, type: 1, isActive: 1 }, options: { name: 'tenant_type_isActive' } },
  ],
  SmsSender: [
    { keys: { tenantId: 1, provider: 1, senderNumber: 1 }, options: { name: 'tenant_provider_senderNumber' } },
    { keys: { tenantId: 1, isActive: 1 }, options: { name: 'tenant_isActive' } },
  ],
  SmsLog: [
    { keys: { tenantId: 1, createdAt: -1 }, options: { name: 'tenant_createdAt' } },
    { keys: { tenantId: 1, status: 1, createdAt: -1 }, options: { name: 'tenant_status_createdAt' } },
  ],
  SystemMailTemplate: [
    { keys: { tenantId: 1, event: 1 }, options: { unique: true, name: 'tenant_event_uniq' } },
    { keys: { tenantId: 1, category: 1, enabled: 1 }, options: { name: 'tenant_category_enabled' } },
  ],
  SystemMailLog: [
    { keys: { tenantId: 1, sentAt: -1 }, options: { name: 'tenant_sentAt' } },
    { keys: { tenantId: 1, trigger: 1, sentAt: -1 }, options: { name: 'tenant_trigger_sentAt' } },
  ],
};

before(async () => {
  process.env.TENANCY_ENFORCEMENT = 'enforce';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (savedEnforcement === undefined) delete process.env.TENANCY_ENFORCEMENT;
  else process.env.TENANCY_ENFORCEMENT = savedEnforcement;
});

test('Brand and Marketing collections are registered as tenant collections', () => {
  for (const c of ['brands', 'staticpages', 'promotions', 'viplevels', 'playersegments',
    'smstemplates', 'smssenders', 'smslogs', 'systemmailtemplates', 'systemmaillogs']) {
    assert.ok(isTenantCollection(c), `expected ${c} to be tenant collection`);
  }

  const registered = listTenantIndexes();
  for (const [modelName, specs] of Object.entries(EXPECTED_INDEXES)) {
    const model = MODELS[modelName];
    const path = model.schema.path('tenantId');
    assert.ok(path, `${modelName}: tenantId missing`);
    assert.equal(path.options.immutable, true, `${modelName}: tenantId must be immutable`);
    assert.equal(path.options.required, false, `${modelName}: tenantId stays optional until İP-8`);
    assert.notEqual(model.schema.options.autoIndex, false, `${modelName}: autoIndex must stay untouched`);
    assert.ok(model.schema.options.autoIndex == null, `${modelName}: autoIndex must be unchanged`);
    assert.equal(
      model.schema.indexes().some(([keys]) => keys.tenantId === 1 && Object.keys(keys).length > 1),
      false,
      `${modelName}: compound indexes must not be declared on the schema`
    );
    assert.deepEqual(
      registered.filter(({ modelName: name }) => name === modelName).map(({ keys, options }) => ({ keys, options })),
      specs,
      `${modelName}: unexpected registry entry set`
    );
  }
});

test('StaticPage has tenantId and brandId for TEN-BRAND scope', async () => {
  const page = await runWithTenant(T1, () =>
    StaticPage.create({
      brandId: B1,
      slug: 'terms',
      category: 'legal',
      route: '/legal/terms',
      title: 'Terms of Service',
      footerColumn: 'legal',
    })
  );
  assert.equal(String(page.tenantId), String(T1));
  assert.equal(String(page.brandId), String(B1));
});

test('VipLevel, PlayerSegment, SmsTemplate and SystemMailTemplate stamp tenantId', async () => {
  const vip = await runWithTenant(T1, () => VipLevel.create({ level: 1, name: 'Bronze', xpRequired: 0 }));
  assert.equal(String(vip.tenantId), String(T1));

  const seg = await runWithTenant(T1, () => PlayerSegment.create({ name: 'High Rollers', slug: 'high-rollers' }));
  assert.equal(String(seg.tenantId), String(T1));

  const sms = await runWithTenant(T1, () => SmsTemplate.create({ key: 'welcome_sms', title: 'Welcome', content: 'Hi' }));
  assert.equal(String(sms.tenantId), String(T1));

  const mail = await runWithTenant(T1, () =>
    SystemMailTemplate.create({ event: 'welcome_mail', category: 'action', name: 'Welcome', subject: 'Welcome', body: 'Hi' })
  );
  assert.equal(String(mail.tenantId), String(T1));
});
