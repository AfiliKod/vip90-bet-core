process.env.TENANCY_MODE = 'single';
process.env.OPERATOR_SECRET_ENCRYPTION_KEY ||= 'a'.repeat(64);

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const { default: Setting } = await import('../src/models/Setting.js');
const { default: Tenant } = await import('../src/models/Tenant.js');
const { setDefaultTenantId } = await import('../src/tenancy/defaultTenantId.js');
const { runSettingsMigration } = await import('../src/tenancy/settingsMigration.js');

// Stores under test
const { emailConfig } = await import('../src/config/emailConfig.js');
const { slikairConfig, getSlikairCredentials, isSlikairConfigured } = await import('../src/config/slikairConfig.js');
const { googleAuthConfig, getGoogleAuthSettings } = await import('../src/config/googleAuthConfig.js');
const { kycConfig } = await import('../src/config/kyc.js');
const { smsSettings, getSmsConfig, getSmsSettingsStatus } = await import('../src/services/smsSettings.js');
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

describe('Task 8: Settings single-mode snapshot parity', () => {
  let defaultTenant;

  before(async () => {
    await mongoose.connect(TEST_MONGO);
    await mongoose.connection.dropDatabase();
    await runSettingsMigration({ connection: mongoose.connection });
    defaultTenant = await Tenant.create({ name: 'Default Tenant', key: 'default', isDefault: true });
    setDefaultTenantId(defaultTenant._id);
  });

  after(async () => {
    setDefaultTenantId(null);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('returns baseline snapshot across all stores in single mode', async () => {
    // 1. emailConfig baseline
    const email = await emailConfig.getAll();
    assert.deepEqual(email, {
      host: '',
      port: '587',
      secure: 'false',
      user: '',
      pass: '',
      from: 'noreply@vip90.bet',
      fromName: '',
      provider: '',
      gatewayEnabled: 'true',
      token: '',
      useSandbox: 'false',
      sandboxInboxId: '',
    });

    // 2. slikairConfig baseline
    const slikair = await slikairConfig.getAll();
    assert.deepEqual(slikair, {
      merchantId: '',
      secretKey: '',
      apiKey: '',
      merchantToken: '',
      siteId: '',
      baseUrl: 'https://sandbox.slikair.online/api/v2',
      webhookSecret: '',
    });
    assert.equal(await isSlikairConfigured(), false);

    // 3. googleAuthConfig baseline
    const google = await googleAuthConfig.getAll();
    assert.deepEqual(google, {
      enabled: 'true',
      clientId: '',
      clientSecret: '',
      redirectUri: '',
    });
    const googleSettings = await getGoogleAuthSettings();
    assert.equal(googleSettings.enabled, true);
    assert.equal(googleSettings.active, false);

    // 4. kycConfig baseline
    const kycAll = await kycConfig.getAll();
    assert.equal(kycAll.length, 7);
    assert.equal(await kycConfig.get('KYC_ENABLED'), 'true');
    assert.equal(await kycConfig.get('KYC_PROVIDER'), 'manual');
    assert.equal(await kycConfig.get('SUMSUB_LEVEL_NAME'), 'basic-kyc-level');
    assert.equal(await kycConfig.get('KYC_FAILURE_POLICY'), 'block');
    assert.equal(await kycConfig.get('SUMSUB_APP_TOKEN'), null);
    assert.equal(await kycConfig.get('SUMSUB_SECRET_KEY'), null);

    // 5. smsSettings baseline
    const smsCfg = await getSmsConfig();
    assert.equal(smsCfg.provider, 'twilio');
    assert.equal(smsCfg.accountType, 'unknown');
    assert.equal(smsCfg.configured, false);
    assert.deepEqual(smsCfg.missing, ['accountSid', 'authToken', 'sender']);

    // 6. cryptoSettings baseline
    const crypto = await getCryptoSettings();
    assert.equal(crypto.network, 'mainnet');
    assert.ok(typeof crypto.usdtTryRate === 'number');
    assert.equal(crypto.deposit.autoCreditLimit, 100);
    assert.equal(crypto.withdraw.autoProcessLimit, 15);

    // 7. brandingStore baseline
    const branding = await brandingStore.getValues();
    assert.deepEqual(branding, {
      siteName: null,
      logo: null,
      favicon: null,
      fontFamily: null,
      fontFile: null,
    });
    assert.equal(await getSiteName(), 'Default Tenant');

    // 8. themeStore baseline
    const themeVars = await themeStore.getCssVars();
    assert.ok(themeVars['--color-primary']);
    assert.ok(themeVars['--color-primary-dark']);
    assert.ok(themeVars['--color-accent']);
    assert.ok(themeVars['--radius-md']);
    assert.ok(themeVars['--font-display']);

    // 9. moduleStore baseline
    const modules = await moduleStore.list();
    assert.ok(Array.isArray(modules));
    assert.ok(modules.length >= 7);
    assert.equal(await moduleStore.isEnabled('casino-content'), false);

    // 10. seoStore baseline
    assert.equal(await seoStore.isConfigured(), false);
    const seo = await seoStore.get();
    assert.equal(seo.siteTitle, '');
    assert.equal(seo.description, '');

    // 11. referralSettings baseline
    const ref = await referralSettings.get();
    assert.equal(ref.enabled, true);
    assert.equal(ref.commissionRate, 10);

    // 12. bettingDisplaySettings baseline
    const betting = await getBettingDisplaySettings();
    assert.deepEqual(betting, {
      prioritySport: 'football',
      priorityCountry: 'Turkey',
    });

    // 13. localeStore baseline
    assert.equal(await localeStore.get(), 'tr');

    // 14. timezoneStore baseline
    assert.equal(await timezoneStore.get(), 'Europe/Istanbul');

    // 15. opsSettings baseline
    assert.equal(await opsSettings.get('TELEGRAM_BOT_TOKEN'), null);
    assert.equal(await opsSettings.get('ALERT_EMAIL_TO'), null);

    // 16. homeContentStore baseline
    const home = await homeContentStore.get();
    assert.deepEqual(home, { sectionOrder: [], banners: [] });

    // 17. featuredGamesStore baseline
    const games = await featuredGamesStore.get();
    assert.deepEqual(games, []);

    // 18. currencyStore baseline
    const curr = await currencyStore.getActive();
    assert.equal(curr.code, 'TRY');
    assert.equal(curr.symbol, '₺');

    // 19. agentToggleStore baseline
    assert.equal(await agentToggleStore.isEnabled(), false);
  });

  it('persists and reflects updates across all stores in single mode', async () => {
    const adminId = new mongoose.Types.ObjectId();
    // 1. emailConfig update
    await emailConfig.update({
      host: 'smtp.single.test',
      port: '465',
      secure: 'true',
      user: 'u_single',
      pass: 'p_single_secret',
      from: 'noreply@single.test',
      fromName: 'Single Brand',
    });
    const emailUpdated = await emailConfig.getAll();
    assert.equal(emailUpdated.host, 'smtp.single.test');
    assert.equal(emailUpdated.port, '465');
    assert.equal(emailUpdated.secure, 'true');
    assert.equal(emailUpdated.user, 'u_single');
    assert.equal(emailUpdated.pass, 'p_single_secret');
    assert.equal(emailUpdated.from, 'noreply@single.test');
    assert.equal(emailUpdated.fromName, 'Single Brand');

    // 2. slikairConfig update
    await slikairConfig.update({
      merchantId: 'm_single_99',
      secretKey: 'slk_sec_single_99',
      merchantToken: 'm_token_single',
      siteId: 'site_single_1',
    });
    const slikairUpdated = await slikairConfig.getAll();
    assert.equal(slikairUpdated.merchantId, 'm_single_99');
    assert.equal(slikairUpdated.secretKey, 'slk_sec_single_99');
    assert.equal(slikairUpdated.merchantToken, 'm_token_single');
    assert.equal(slikairUpdated.siteId, 'site_single_1');
    assert.equal(await isSlikairConfigured(), true);

    // 3. googleAuthConfig update
    await googleAuthConfig.update({
      enabled: 'true',
      clientId: 'google-client-id-single',
      clientSecret: 'google-sec-single',
      redirectUri: 'https://single.vip90.bet/auth/callback',
    });
    const googleUpdated = await googleAuthConfig.getAll();
    assert.equal(googleUpdated.clientId, 'google-client-id-single');
    assert.equal(googleUpdated.clientSecret, 'google-sec-single');
    assert.equal(googleUpdated.redirectUri, 'https://single.vip90.bet/auth/callback');
    const googleAuthActive = await getGoogleAuthSettings();
    assert.equal(googleAuthActive.active, true);

    // 4. kycConfig update
    await kycConfig.save({
      KYC_ENABLED: 'true',
      KYC_PROVIDER: 'sumsub',
      SUMSUB_APP_TOKEN: 'sumsub_token_single',
      SUMSUB_SECRET_KEY: 'sumsub_secret_single',
      SUMSUB_LEVEL_NAME: 'advanced-kyc',
    });
    assert.equal(await kycConfig.get('KYC_PROVIDER'), 'sumsub');
    assert.equal(await kycConfig.get('SUMSUB_APP_TOKEN'), 'sumsub_token_single');
    assert.equal(await kycConfig.get('SUMSUB_SECRET_KEY'), 'sumsub_secret_single');
    assert.equal(await kycConfig.get('SUMSUB_LEVEL_NAME'), 'advanced-kyc');
    assert.equal(await kycConfig.sourceOf('SUMSUB_SECRET_KEY'), 'db');

    // 5. smsSettings update
    await smsSettings.update({
      'sms.provider': 'twilio',
      'sms.twilio.accountSid': 'AC_single_live',
      'sms.twilio.authToken': 'tw_auth_single_live',
      'sms.twilio.fromNumber': '+905551234567',
    });
    assert.equal(await smsSettings.plain('sms.twilio.accountSid'), 'AC_single_live');
    assert.equal(await smsSettings.secret('sms.twilio.authToken'), 'tw_auth_single_live');
    assert.equal(await smsSettings.plain('sms.twilio.fromNumber'), '+905551234567');
    const smsStatus = await getSmsSettingsStatus();
    assert.equal(smsStatus.accountSid, 'AC_single_live');
    assert.equal(smsStatus.accountSidSource, 'db');
    assert.equal(smsStatus.authTokenConfigured, true);

    // 6. cryptoSettings update
    await updateCryptoSettings({ usdtTryRate: 36.8, network: 'mainnet' }, adminId);
    const cryptoUpdated = await getCryptoSettings();
    assert.equal(cryptoUpdated.usdtTryRate, 36.8);
    assert.equal(cryptoUpdated.network, 'mainnet');

    // 7. brandingStore update
    await setBrandingField('siteName', 'VIP90 Single Parity', adminId);
    assert.equal((await brandingStore.getValues()).siteName, 'VIP90 Single Parity');
    assert.equal(await getSiteName(), 'VIP90 Single Parity');

    // 8. themeStore update
    await setThemeToken('primary', '#ff0055', adminId);
    const themeUpdated = await themeStore.getCssVars();
    assert.equal(themeUpdated['--color-primary'], '#ff0055');

    // 9. moduleStore update
    await setModuleEnabled('betting', true, adminId);
    assert.equal(await moduleStore.isEnabled('betting'), true);

    // 10. seoStore update
    await seoStore.update({ siteTitle: 'Single Parity Title', description: 'Single Parity Desc' }, adminId);
    assert.equal(await seoStore.isConfigured(), true);
    const seoUpdated = await seoStore.get();
    assert.equal(seoUpdated.siteTitle, 'Single Parity Title');
    assert.equal(seoUpdated.description, 'Single Parity Desc');

    // 11. referralSettings update
    await referralSettings.update({ enabled: true, commissionRate: 18 }, adminId);
    const refUpdated = await referralSettings.get();
    assert.equal(refUpdated.commissionRate, 18);

    // 12. bettingDisplaySettings update
    await updateBettingDisplaySettings({ prioritySport: 'basketball', priorityCountry: 'Germany' }, adminId);
    const bettingUpdated = await getBettingDisplaySettings();
    assert.deepEqual(bettingUpdated, {
      prioritySport: 'basketball',
      priorityCountry: 'Germany',
    });

    // 13. localeStore update
    await localeStore.set('en', adminId);
    assert.equal(await localeStore.get(), 'en');

    // 14. timezoneStore update
    await timezoneStore.set('UTC', adminId);
    assert.equal(await timezoneStore.get(), 'UTC');

    // 15. opsSettings update (platform alerts)
    await Setting.create({ key: 'TELEGRAM_BOT_TOKEN', value: 'bot_single_par', scope: 'platform', tenantId: null });
    opsSettings.invalidate();
    assert.equal(await opsSettings.get('TELEGRAM_BOT_TOKEN'), 'bot_single_par');
    assert.equal(await opsSettings.sourceOf('TELEGRAM_BOT_TOKEN'), 'db');

    // 16. homeContentStore update
    await setHomeContent({ sectionOrder: ['hero', 'casinoGames'], banners: [] }, adminId);
    const homeUpdated = await homeContentStore.get();
    assert.deepEqual(homeUpdated.sectionOrder, ['hero', 'casinoGames']);

    // 17. featuredGamesStore update
    await setFeaturedGameCodes(['game1', 'game2', 'game3'], adminId);
    assert.deepEqual(await featuredGamesStore.get(), ['game1', 'game2', 'game3']);

    // 18. currencyStore update
    await setActiveCurrency('EUR', adminId);
    assert.equal((await currencyStore.getActive()).code, 'EUR');

    // 19. agentToggleStore update
    await setAgentEnabled(true, adminId);
    assert.equal(await agentToggleStore.isEnabled(), true);
  });

  it('falls back to environment variables in single mode when DB values are unconfigured', async () => {
    // Save original env
    const originalAlertEmail = process.env.ALERT_EMAIL_TO;
    const originalSmsCountry = process.env.SMS_TRIAL_SIGNUP_COUNTRY;
    const originalKycWebhook = process.env.SUMSUB_WEBHOOK_SECRET;

    process.env.ALERT_EMAIL_TO = 'single-ops@vip90.bet';
    process.env.SMS_TRIAL_SIGNUP_COUNTRY = 'DE';
    process.env.SUMSUB_WEBHOOK_SECRET = 'env-single-sumsub-wh';

    try {
      opsSettings.invalidate();
      smsSettings.invalidate();
      kycConfig.invalidate();

      // opsSettings falls back to env
      assert.equal(await opsSettings.get('ALERT_EMAIL_TO'), 'single-ops@vip90.bet');
      assert.equal(await opsSettings.sourceOf('ALERT_EMAIL_TO'), 'env');

      // smsSettings falls back to env
      assert.equal(await smsSettings.plain('sms.trialSignUpCountry'), 'DE');
      assert.equal(await smsSettings.sourceOf('sms.trialSignUpCountry'), 'env');

      // kycConfig falls back to env
      assert.equal(await kycConfig.get('SUMSUB_WEBHOOK_SECRET'), 'env-single-sumsub-wh');
      assert.equal(await kycConfig.sourceOf('SUMSUB_WEBHOOK_SECRET'), 'env');
    } finally {
      if (originalAlertEmail !== undefined) process.env.ALERT_EMAIL_TO = originalAlertEmail;
      else delete process.env.ALERT_EMAIL_TO;

      if (originalSmsCountry !== undefined) process.env.SMS_TRIAL_SIGNUP_COUNTRY = originalSmsCountry;
      else delete process.env.SMS_TRIAL_SIGNUP_COUNTRY;

      if (originalKycWebhook !== undefined) process.env.SUMSUB_WEBHOOK_SECRET = originalKycWebhook;
      else delete process.env.SUMSUB_WEBHOOK_SECRET;
    }
  });
});
