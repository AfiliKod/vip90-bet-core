process.env.TENANCY_MODE = 'multi';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { runWithTenant, runAsPlatform } = await import('../src/tenancy/context.js');
const { runSettingsMigration } = await import('../src/tenancy/settingsMigration.js');
const { decryptSecret, decryptSensitive, isEncryptedSecret } = await import('../src/utils/secretCrypto.js');
const { listTenantIndexes } = await import('../src/tenancy/indexRegistry.js');

// Stores under test
const { emailConfig } = await import('../src/config/emailConfig.js');
const { slikairConfig, isSlikairConfigured } = await import('../src/config/slikairConfig.js');
const { googleAuthConfig, getGoogleAuthSettings } = await import('../src/config/googleAuthConfig.js');
const { kycConfig } = await import('../src/config/kyc.js');
const { smsSettings, getSmsConfig } = await import('../src/services/smsSettings.js');
const { getCryptoSettings, updateCryptoSettings } = await import('../src/services/cryptoSettings.js');
const { brandingStore, setBrandingField, getSiteName } = await import('../src/branding/index.js');
const { themeStore, setThemeToken } = await import('../src/theme/index.js');
const { moduleStore, setModuleEnabled } = await import('../src/modules/index.js');
const { seoStore } = await import('../src/seo/store.js');
const { referralSettings } = await import('../src/services/referralSettings.js');
const { getBettingDisplaySettings, updateBettingDisplaySettings } = await import('../src/services/bettingDisplaySettings.js');
const { localeStore } = await import('../src/services/localeLive.js');
const { timezoneStore } = await import('../src/services/timezoneLive.js');
const { settings: opsSettings, saveScopedSetting } = await import('../src/services/settings.js');
const { homeContentStore, setHomeContent } = await import('../src/pages/index.js');
const { featuredGamesStore, setFeaturedGameCodes } = await import('../src/games/index.js');
const { currencyStore, setActiveCurrency } = await import('../src/currency/index.js');
const { agentToggleStore, setAgentEnabled } = await import('../src/services/support/index.js');

const TEST_MONGO = process.env.TENANCY_TEST_MONGO || 'mongodb://localhost:27017/vip90_test_ip4_t8';

describe('Task 8: Tenant settings isolation, database encryption and env protection', () => {
  let t1, t2;
  const adminId = new mongoose.Types.ObjectId();

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await mongoose.connection.dropDatabase();
    await runSettingsMigration({ connection: mongoose.connection });
    t1 = await Tenant.create({ name: 'Tenant A', key: 'tenant-a' });
    t2 = await Tenant.create({ name: 'Tenant B', key: 'tenant-b' });
  });

  after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('multi mode zero env fall-through: host environment secrets never leak to tenant lacking DB records', async () => {
    // Populate host environment with sensitive credentials
    const leakKeys = [
      'SMTP_PASS', 'SMTP_HOST', 'SLIKAIR_SECRET_KEY', 'SLIKAIR_MERCHANT_ID',
      'TWILIO_AUTH_TOKEN', 'TWILIO_ACCOUNT_SID', 'SUMSUB_SECRET_KEY', 'SUMSUB_APP_TOKEN',
      'GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'USDT_TRY_RATE', 'TRON_NETWORK',
    ];
    const savedEnv = {};
    for (const k of leakKeys) savedEnv[k] = process.env[k];

    process.env.SMTP_PASS = 'leaked_smtp_pass_123';
    process.env.SMTP_HOST = 'smtp.host-leak.test';
    process.env.SLIKAIR_SECRET_KEY = 'leaked_slikair_key_123';
    process.env.SLIKAIR_MERCHANT_ID = 'leaked_slikair_merch';
    process.env.TWILIO_AUTH_TOKEN = 'leaked_twilio_token_123';
    process.env.TWILIO_ACCOUNT_SID = 'AC_leaked_twilio';
    process.env.SUMSUB_SECRET_KEY = 'leaked_sumsub_sec_123';
    process.env.SUMSUB_APP_TOKEN = 'leaked_sumsub_tok_123';
    process.env.GOOGLE_CLIENT_SECRET = 'leaked_google_sec_123';
    process.env.GOOGLE_CLIENT_ID = 'leaked_google_id';
    process.env.USDT_TRY_RATE = '99.99';
    process.env.TRON_NETWORK = 'nile';

    try {
      emailConfig.invalidate();
      slikairConfig.invalidate();
      googleAuthConfig.invalidate();
      kycConfig.invalidate();
      smsSettings.invalidate();

      await runWithTenant(t1._id, async () => {
        // 1. emailConfig must not leak host SMTP env
        const email = await emailConfig.getAll();
        assert.equal(email.pass, '', 'Tenant without DB settings must never see host SMTP_PASS');
        assert.equal(email.host, '', 'Tenant without DB settings must never see host SMTP_HOST');

        // 2. slikairConfig must not leak host Slikair env
        const slikair = await slikairConfig.getAll();
        assert.equal(slikair.secretKey, '', 'Tenant without DB settings must never see host SLIKAIR_SECRET_KEY');
        assert.equal(slikair.merchantId, '', 'Tenant without DB settings must never see host SLIKAIR_MERCHANT_ID');
        assert.equal(await isSlikairConfigured(), false);

        // 3. googleAuthConfig must not leak host Google env
        const google = await googleAuthConfig.getAll();
        assert.equal(google.clientSecret, '', 'Tenant without DB settings must never see host GOOGLE_CLIENT_SECRET');
        assert.equal(google.clientId, '', 'Tenant without DB settings must never see host GOOGLE_CLIENT_ID');
        const googleSettings = await getGoogleAuthSettings();
        assert.equal(googleSettings.active, false);

        // 4. kycConfig must not leak host Sumsub env
        assert.equal(await kycConfig.get('SUMSUB_SECRET_KEY'), null, 'Tenant must never see host SUMSUB_SECRET_KEY');
        assert.equal(await kycConfig.get('SUMSUB_APP_TOKEN'), null, 'Tenant must never see host SUMSUB_APP_TOKEN');
        assert.equal(await kycConfig.sourceOf('SUMSUB_SECRET_KEY'), 'unset');

        // 5. smsSettings must not leak host Twilio env
        assert.equal(await smsSettings.secret('sms.twilio.authToken'), null, 'Tenant must never see host TWILIO_AUTH_TOKEN');
        assert.equal(await smsSettings.plain('sms.twilio.accountSid'), null, 'Tenant must never see host TWILIO_ACCOUNT_SID');
        assert.equal(await smsSettings.sourceOf('sms.twilio.authToken'), 'unset');
        const smsCfg = await getSmsConfig();
        assert.equal(smsCfg.configured, false);

        // 6. cryptoSettings must not leak host USDT_TRY_RATE or TRON_NETWORK
        const crypto = await getCryptoSettings();
        assert.notEqual(crypto.usdtTryRate, 99.99, 'Tenant must not inherit host USDT_TRY_RATE');
        assert.notEqual(crypto.network, 'nile', 'Multi mode tenant must not inherit host TRON_NETWORK');
        assert.equal(crypto.network, 'mainnet', 'Multi mode tenant must resolve to standard default');
      });
    } finally {
      for (const k of leakKeys) {
        if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k];
        else delete process.env[k];
      }
    }
  });

  it('strict multi-tenant isolation: Tenant A and Tenant B maintain distinct configurations across all stores', async () => {
    // 1. Configure Tenant A across all stores
    await runWithTenant(t1._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant-a.com',
        port: '587',
        user: 'user_t1',
        pass: 'pass_t1_secret',
        from: 'noreply@tenant-a.com',
        fromName: 'Brand A',
      });
      await slikairConfig.update({
        merchantId: 'merch_t1',
        secretKey: 'slk_sec_t1',
        merchantToken: 'token_t1',
        siteId: 'site_t1',
      });
      await googleAuthConfig.update({
        clientId: 'client_t1.apps.google.com',
        clientSecret: 'gsec_t1',
        redirectUri: 'https://tenant-a.com/auth/callback',
      });
      await kycConfig.save({
        SUMSUB_APP_TOKEN: 'sum_tok_t1',
        SUMSUB_SECRET_KEY: 'sum_sec_t1',
        SUMSUB_LEVEL_NAME: 'tier1-kyc',
      });
      await smsSettings.update({
        'sms.provider': 'twilio',
        'sms.twilio.accountSid': 'AC_t1_sid',
        'sms.twilio.authToken': 'tw_sec_t1',
        'sms.twilio.fromNumber': '+905551111111',
      });
      await updateCryptoSettings({ usdtTryRate: 35.5 }, adminId);
      await setBrandingField('siteName', 'Tenant A Casino', adminId);
      await setThemeToken('primary', '#112233', adminId);
      await setModuleEnabled('betting', true, adminId);
      await seoStore.update({ siteTitle: 'SEO Tenant A', description: 'Desc A' }, adminId);
      await referralSettings.update({ commissionRate: 14 }, adminId);
      await updateBettingDisplaySettings({ prioritySport: 'tennis', priorityCountry: 'Spain' }, adminId);
      await localeStore.set('en', adminId);
      await timezoneStore.set('America/New_York', adminId);
      await setHomeContent({ sectionOrder: ['hero', 'sportsBets'], banners: [] }, adminId);
      await setFeaturedGameCodes(['game_a1', 'game_a2'], adminId);
      await setActiveCurrency('USD', adminId);
      await setAgentEnabled(true, adminId);
    });

    // 2. Configure Tenant B across all stores
    await runWithTenant(t2._id, async () => {
      await emailConfig.update({
        host: 'smtp.tenant-b.com',
        port: '465',
        user: 'user_t2',
        pass: 'pass_t2_secret',
        from: 'noreply@tenant-b.com',
        fromName: 'Brand B',
      });
      await slikairConfig.update({
        merchantId: 'merch_t2',
        secretKey: 'slk_sec_t2',
        merchantToken: 'token_t2',
        siteId: 'site_t2',
      });
      await googleAuthConfig.update({
        clientId: 'client_t2.apps.google.com',
        clientSecret: 'gsec_t2',
        redirectUri: 'https://tenant-b.com/auth/callback',
      });
      await kycConfig.save({
        SUMSUB_APP_TOKEN: 'sum_tok_t2',
        SUMSUB_SECRET_KEY: 'sum_sec_t2',
        SUMSUB_LEVEL_NAME: 'tier2-kyc',
      });
      await smsSettings.update({
        'sms.provider': 'twilio',
        'sms.twilio.accountSid': 'AC_t2_sid',
        'sms.twilio.authToken': 'tw_sec_t2',
        'sms.twilio.fromNumber': '+905552222222',
      });
      await updateCryptoSettings({ usdtTryRate: 42.0 }, adminId);
      await setBrandingField('siteName', 'Tenant B Sports', adminId);
      await setThemeToken('primary', '#445566', adminId);
      await setModuleEnabled('betting', false, adminId);
      await seoStore.update({ siteTitle: 'SEO Tenant B', description: 'Desc B' }, adminId);
      await referralSettings.update({ commissionRate: 28 }, adminId);
      await updateBettingDisplaySettings({ prioritySport: 'basketball', priorityCountry: 'USA' }, adminId);
      await localeStore.set('de', adminId);
      await timezoneStore.set('Asia/Tokyo', adminId);
      await setHomeContent({ sectionOrder: ['casinoGames', 'bottomCta'], banners: [] }, adminId);
      await setFeaturedGameCodes(['game_b1'], adminId);
      await setActiveCurrency('EUR', adminId);
      await setAgentEnabled(false, adminId);
    });

    // 3. Verify Tenant A reads back Tenant A values
    await runWithTenant(t1._id, async () => {
      const email = await emailConfig.getAll();
      assert.equal(email.host, 'smtp.tenant-a.com');
      assert.equal(email.user, 'user_t1');
      assert.equal(email.pass, 'pass_t1_secret');
      assert.equal(email.fromName, 'Brand A');

      const slikair = await slikairConfig.getAll();
      assert.equal(slikair.merchantId, 'merch_t1');
      assert.equal(slikair.secretKey, 'slk_sec_t1');

      const google = await googleAuthConfig.getAll();
      assert.equal(google.clientId, 'client_t1.apps.google.com');
      assert.equal(google.clientSecret, 'gsec_t1');

      assert.equal(await kycConfig.get('SUMSUB_APP_TOKEN'), 'sum_tok_t1');
      assert.equal(await kycConfig.get('SUMSUB_SECRET_KEY'), 'sum_sec_t1');
      assert.equal(await kycConfig.get('SUMSUB_LEVEL_NAME'), 'tier1-kyc');

      assert.equal(await smsSettings.plain('sms.twilio.accountSid'), 'AC_t1_sid');
      assert.equal(await smsSettings.secret('sms.twilio.authToken'), 'tw_sec_t1');

      const crypto = await getCryptoSettings();
      assert.equal(crypto.usdtTryRate, 35.5);

      assert.equal((await brandingStore.getValues()).siteName, 'Tenant A Casino');
      assert.equal(await getSiteName(), 'Tenant A Casino');

      assert.equal((await themeStore.getCssVars())['--color-primary'], '#112233');
      assert.equal(await moduleStore.isEnabled('betting'), true);

      const seo = await seoStore.get();
      assert.equal(seo.siteTitle, 'SEO Tenant A');
      assert.equal(seo.description, 'Desc A');

      assert.equal((await referralSettings.get()).commissionRate, 14);

      const betting = await getBettingDisplaySettings();
      assert.equal(betting.prioritySport, 'tennis');
      assert.equal(betting.priorityCountry, 'Spain');

      assert.equal(await localeStore.get(), 'en');
      assert.equal(await timezoneStore.get(), 'America/New_York');

      const home = await homeContentStore.get();
      assert.deepEqual(home.sectionOrder, ['hero', 'sportsBets']);

      assert.deepEqual(await featuredGamesStore.get(), ['game_a1', 'game_a2']);
      assert.equal((await currencyStore.getActive()).code, 'USD');
      assert.equal(await agentToggleStore.isEnabled(), true);
    });

    // 4. Verify Tenant B reads back Tenant B values
    await runWithTenant(t2._id, async () => {
      const email = await emailConfig.getAll();
      assert.equal(email.host, 'smtp.tenant-b.com');
      assert.equal(email.user, 'user_t2');
      assert.equal(email.pass, 'pass_t2_secret');
      assert.equal(email.fromName, 'Brand B');

      const slikair = await slikairConfig.getAll();
      assert.equal(slikair.merchantId, 'merch_t2');
      assert.equal(slikair.secretKey, 'slk_sec_t2');

      const google = await googleAuthConfig.getAll();
      assert.equal(google.clientId, 'client_t2.apps.google.com');
      assert.equal(google.clientSecret, 'gsec_t2');

      assert.equal(await kycConfig.get('SUMSUB_APP_TOKEN'), 'sum_tok_t2');
      assert.equal(await kycConfig.get('SUMSUB_SECRET_KEY'), 'sum_sec_t2');
      assert.equal(await kycConfig.get('SUMSUB_LEVEL_NAME'), 'tier2-kyc');

      assert.equal(await smsSettings.plain('sms.twilio.accountSid'), 'AC_t2_sid');
      assert.equal(await smsSettings.secret('sms.twilio.authToken'), 'tw_sec_t2');

      const crypto = await getCryptoSettings();
      assert.equal(crypto.usdtTryRate, 42.0);

      assert.equal((await brandingStore.getValues()).siteName, 'Tenant B Sports');
      assert.equal(await getSiteName(), 'Tenant B Sports');

      assert.equal((await themeStore.getCssVars())['--color-primary'], '#445566');
      assert.equal(await moduleStore.isEnabled('betting'), false);

      const seo = await seoStore.get();
      assert.equal(seo.siteTitle, 'SEO Tenant B');
      assert.equal(seo.description, 'Desc B');

      assert.equal((await referralSettings.get()).commissionRate, 28);

      const betting = await getBettingDisplaySettings();
      assert.equal(betting.prioritySport, 'basketball');
      assert.equal(betting.priorityCountry, 'USA');

      assert.equal(await localeStore.get(), 'de');
      assert.equal(await timezoneStore.get(), 'Asia/Tokyo');

      const home = await homeContentStore.get();
      assert.deepEqual(home.sectionOrder, ['casinoGames', 'bottomCta']);

      assert.deepEqual(await featuredGamesStore.get(), ['game_b1']);
      assert.equal((await currencyStore.getActive()).code, 'EUR');
      assert.equal(await agentToggleStore.isEnabled(), false);
    });

    // 5. Concurrent async read execution to verify no cache bleed
    for (let i = 0; i < 5; i++) {
      const [resA, resB] = await Promise.all([
        runWithTenant(t1._id, async () => ({
          emailHost: (await emailConfig.getAll()).host,
          slikairMerch: (await slikairConfig.getAll()).merchantId,
          siteName: (await brandingStore.getValues()).siteName,
          rate: (await getCryptoSettings()).usdtTryRate,
          currency: (await currencyStore.getActive()).code,
        })),
        runWithTenant(t2._id, async () => ({
          emailHost: (await emailConfig.getAll()).host,
          slikairMerch: (await slikairConfig.getAll()).merchantId,
          siteName: (await brandingStore.getValues()).siteName,
          rate: (await getCryptoSettings()).usdtTryRate,
          currency: (await currencyStore.getActive()).code,
        })),
      ]);

      assert.equal(resA.emailHost, 'smtp.tenant-a.com');
      assert.equal(resA.slikairMerch, 'merch_t1');
      assert.equal(resA.siteName, 'Tenant A Casino');
      assert.equal(resA.rate, 35.5);
      assert.equal(resA.currency, 'USD');

      assert.equal(resB.emailHost, 'smtp.tenant-b.com');
      assert.equal(resB.slikairMerch, 'merch_t2');
      assert.equal(resB.siteName, 'Tenant B Sports');
      assert.equal(resB.rate, 42.0);
      assert.equal(resB.currency, 'EUR');
    }
  });

  it('database secrets encryption verification: all credentials in Setting collection are encrypted at rest', async () => {
    // 1. Slikair secretKey is encrypted
    const slikairRow = await Setting.findOne({ tenantId: t1._id, key: 'slikair.secretKey' }).lean();
    assert.ok(slikairRow, 'slikair.secretKey row must exist in DB');
    assert.notEqual(slikairRow.value, 'slk_sec_t1', 'Plain secret must not be stored in DB');
    assert.ok(isEncryptedSecret(slikairRow.value) || slikairRow.value.split('.').length === 3, 'Must be encrypted');
    assert.equal(decryptSensitive(slikairRow.value), 'slk_sec_t1');

    // 2. SMTP pass is encrypted
    const smtpRow = await Setting.findOne({ tenantId: t1._id, key: 'smtp.pass' }).lean();
    assert.ok(smtpRow, 'smtp.pass row must exist in DB');
    assert.notEqual(smtpRow.value, 'pass_t1_secret', 'Plain SMTP password must not be stored in DB');
    assert.ok(smtpRow.value.split('.').length === 3, 'Must be AES-256-GCM ciphertext');
    assert.equal(decryptSecret(smtpRow.value), 'pass_t1_secret');

    // 3. Twilio SMS authToken is encrypted
    const smsRow = await Setting.findOne({ tenantId: t1._id, key: 'sms.twilio.authToken' }).lean();
    assert.ok(smsRow, 'sms.twilio.authToken row must exist in DB');
    assert.notEqual(smsRow.value, 'tw_sec_t1', 'Plain SMS auth token must not be stored in DB');
    assert.ok(isEncryptedSecret(smsRow.value) || smsRow.value.split('.').length === 3, 'Must be encrypted');
    assert.equal(decryptSensitive(smsRow.value), 'tw_sec_t1');

    // 4. Sumsub KYC SUMSUB_SECRET_KEY is encrypted
    const kycRow = await Setting.findOne({ tenantId: t1._id, key: 'SUMSUB_SECRET_KEY' }).lean();
    assert.ok(kycRow, 'SUMSUB_SECRET_KEY row must exist in DB');
    assert.notEqual(kycRow.value, 'sum_sec_t1', 'Plain Sumsub secret must not be stored in DB');
    assert.ok(kycRow.value.startsWith('enc:v1:'), 'Sumsub secret must use enc:v1: prefix');
    assert.equal(decryptSensitive(kycRow.value), 'sum_sec_t1');

    // 5. Google Auth clientSecret is encrypted
    const googleRow = await Setting.findOne({ tenantId: t1._id, key: 'googleAuth.clientSecret' }).lean();
    assert.ok(googleRow, 'googleAuth.clientSecret row must exist in DB');
    assert.notEqual(googleRow.value, 'gsec_t1', 'Plain Google client secret must not be stored in DB');
    assert.ok(isEncryptedSecret(googleRow.value) || googleRow.value.split('.').length === 3, 'Must be encrypted');
    assert.equal(decryptSensitive(googleRow.value), 'gsec_t1');

    // 6. Global scan of all Setting rows: none of the plain secrets appear anywhere as plaintext substrings
    const allRows = await Setting.find({}).lean();
    const secrets = ['slk_sec_t1', 'slk_sec_t2', 'pass_t1_secret', 'pass_t2_secret', 'tw_sec_t1', 'tw_sec_t2', 'sum_sec_t1', 'sum_sec_t2', 'gsec_t1', 'gsec_t2'];
    for (const row of allRows) {
      for (const secret of secrets) {
        assert.equal(
          row.value.includes(secret),
          false,
          `Plaintext secret leaked in DB Setting row ${row.key}: "${row.value}"`
        );
      }
    }
  });

  it('platform ops alerts are isolated from tenant settings and can read env in multi mode', async () => {
    // 1. Platform ops alert created in platform context
    await runAsPlatform('test-platform-alerts', async () => {
      await Setting.create({
        scope: 'platform',
        tenantId: null,
        key: 'TELEGRAM_CHAT_ID',
        value: '-100platformops',
      });
    });

    opsSettings.invalidate();
    assert.equal(await opsSettings.get('TELEGRAM_CHAT_ID'), '-100platformops');
    assert.equal(await opsSettings.sourceOf('TELEGRAM_CHAT_ID'), 'db');

    // 2. Tenant setting does NOT override platform ops alert
    await runWithTenant(t1._id, async () => {
      await saveScopedSetting('TELEGRAM_CHAT_ID', '-100tenantspoof', adminId);
    });

    opsSettings.invalidate();
    assert.equal(
      await opsSettings.get('TELEGRAM_CHAT_ID'),
      '-100platformops',
      'Tenant setting must never override platform ops alert channel'
    );

    // 3. Platform fields CAN read env in multi mode (spec §4.5)
    const prevAlertEmail = process.env.ALERT_EMAIL_TO;
    process.env.ALERT_EMAIL_TO = 'platform-ops-alert@vip90.bet';
    try {
      opsSettings.invalidate();
      assert.equal(await opsSettings.get('ALERT_EMAIL_TO'), 'platform-ops-alert@vip90.bet');
      assert.equal(await opsSettings.sourceOf('ALERT_EMAIL_TO'), 'env');
    } finally {
      if (prevAlertEmail !== undefined) process.env.ALERT_EMAIL_TO = prevAlertEmail;
      else delete process.env.ALERT_EMAIL_TO;
    }
  });

  it('enforces compound unique index { tenantId, scope, brandId, key } in multi mode', async () => {
    // Registered compound index exists
    const indexes = listTenantIndexes().filter(i => i.modelName === 'Setting');
    assert.equal(indexes.length, 1);
    assert.deepEqual(indexes[0].keys, { tenantId: 1, scope: 1, brandId: 1, key: 1 });
    assert.equal(indexes[0].options.unique, true);

    // Two tenants can store the exact same key without collision
    const rowT1 = await Setting.findOne({ tenantId: t1._id, key: 'slikair.merchantId' });
    const rowT2 = await Setting.findOne({ tenantId: t2._id, key: 'slikair.merchantId' });
    assert.ok(rowT1);
    assert.ok(rowT2);
    assert.equal(String(rowT1.tenantId), String(t1._id));
    assert.equal(String(rowT2.tenantId), String(t2._id));

    // Duplicate key insertion for the SAME tenant, scope and brandId fails with E11000
    await assert.rejects(
      async () => {
        await Setting.collection.insertOne({
          tenantId: t1._id,
          scope: 'tenant',
          brandId: null,
          key: 'slikair.merchantId',
          value: 'duplicate_attempt',
        });
      },
      (err) => err.code === 11000
    );
  });
});
