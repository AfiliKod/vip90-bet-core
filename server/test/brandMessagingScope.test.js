import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Brand from '../src/models/Brand.js';
import StaticPage from '../src/models/StaticPage.js';
import SmsTemplate from '../src/models/SmsTemplate.js';
import SystemMailTemplate from '../src/models/SystemMailTemplate.js';
import { runWithTenant } from '../src/tenancy/context.js';
import { getBrandById, updateBrand } from '../src/controllers/multiBrand.js';
import { getStaticPageById, updateStaticPage } from '../src/controllers/staticPages.js';
import { updateTemplate as updateSmsTemplate } from '../src/controllers/smsTemplate.js';
import { getTemplateById as getMailTemplateById } from '../src/controllers/adminMailTemplates.js';

const TEST_DB = process.env.TENANCY_TEST_MONGO || 'mongodb://127.0.0.1:27017/vip90_test_ip5_t5_brand_msg';
const T1 = new mongoose.Types.ObjectId();
const T2 = new mongoose.Types.ObjectId();

let brandT1, pageT1, smsT1, mailT1;

const savedMode = process.env.TENANCY_MODE;
before(async () => {
  // Cross-tenant isolation is a multi-mode property (scopeTenantId is null in single mode).
  process.env.TENANCY_MODE = 'multi';
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  // NOTE: fixtures carry the fields the current schemas require
  // (category/route/footerColumn for StaticPage, title/content for
  // SmsTemplate, category/name/body for SystemMailTemplate). The
  // assertions below are unchanged from the plan.
  brandT1 = await runWithTenant(T1, () => Brand.create({ name: 'Brand T1', slug: 'brand-t1', domains: [] }));
  pageT1 = await runWithTenant(T1, () => StaticPage.create({ title: 'About T1', slug: 'about-t1', content: 'Info', category: 'company', route: '/about-t1', footerColumn: 'brand' }));
  smsT1 = await runWithTenant(T1, () => SmsTemplate.create({ key: 'welcome_t1', name: 'Welcome', template: 'Hi', title: 'Welcome', content: 'Hi' }));
  mailT1 = await runWithTenant(T1, () => SystemMailTemplate.create({ event: 'welcome_mail_t1', subject: 'Welcome', htmlContent: '<h1>Hi</h1>', category: 'scheduled', name: 'Welcome', body: '<h1>Hi</h1>' }));
});

after(async () => {
  if (savedMode === undefined) delete process.env.TENANCY_MODE; else process.env.TENANCY_MODE = savedMode;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('T2 staff querying T1 Brand, StaticPage, SmsTemplate, or SystemMailTemplate receives 404', async () => {
  const reqBrand = { params: { id: String(brandT1._id) }, tenant: { id: T2 }, body: {} };
  const reqPage = { params: { id: String(pageT1._id) }, tenant: { id: T2 }, body: {} };
  const reqSms = { params: { id: String(smsT1._id) }, tenant: { id: T2 }, validated: { template: 'Hacked' } };
  const reqMail = { params: { id: String(mailT1._id) }, tenant: { id: T2 } };
  const res = { json: () => assert.fail('should not succeed') };

  await runWithTenant(T2, async () => {
    await assert.rejects(async () => getBrandById(reqBrand, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getStaticPageById(reqPage, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => updateSmsTemplate(reqSms, res, (e) => { throw e; }), (e) => e.status === 404);
    await assert.rejects(async () => getMailTemplateById(reqMail, res, (e) => { throw e; }), (e) => e.status === 404);
  });
});
