/**
 * İletişim sayfasının saf mantığı (`communicationsLogic.js`) — node:test.
 * React render edilmeden URL normalize + iki kanalın log/kampanya/otomasyon
 * düzleştirmesi sınanır.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  CHANNELS,
  DEFAULT_CHANNEL,
  SUB_TABS,
  DEFAULT_SUB,
  LOG_STATUSES,
  normalizeChannel,
  normalizeSub,
  normalizeLogRow,
  normalizeAutomationRows,
  normalizeCampaignRows,
  audienceLabelKey,
  identityRows,
} from './communicationsLogic.js';

describe('normalizeChannel / normalizeSub', () => {
  test('geçerli kanal aynen kalır, geçersiz/boş varsayılana düşer', () => {
    for (const ch of CHANNELS) assert.strictEqual(normalizeChannel(ch), ch);
    assert.strictEqual(normalizeChannel('push'), DEFAULT_CHANNEL);
    assert.strictEqual(normalizeChannel(null), DEFAULT_CHANNEL);
    assert.strictEqual(normalizeChannel(''), DEFAULT_CHANNEL);
  });

  test('geçerli alt sekme aynen kalır', () => {
    assert.strictEqual(normalizeSub('email', 'templates'), 'templates');
    assert.strictEqual(normalizeSub('sms', 'test'), 'test');
  });

  test('kanal değişiminde bilinmeyen sub → kanalın varsayılanı (eski yer imi kırılmaz)', () => {
    assert.strictEqual(normalizeSub('email', 'nonsense'), DEFAULT_SUB.email);
    assert.strictEqual(normalizeSub('sms', 'nonsense'), DEFAULT_SUB.sms);
    // Eski yer imi: `?channel=sms&sub=identities` (e-posta sekmesi) → şablonlar
    assert.strictEqual(normalizeSub('sms', 'identities'), 'templates');
    // Sağlayıcı sekmeleri Modules kartlarına taşındı → eski yer imleri şablonlara
    assert.strictEqual(normalizeSub('email', 'provider'), 'templates');
    assert.strictEqual(normalizeSub('sms', 'provider'), 'templates');
    assert.strictEqual(normalizeSub('sms', 'sender'), 'templates');
    // Alt sekmeyi hiç almayan kanallar boş döner (tek panel render edilir)
    assert.strictEqual(normalizeSub('campaigns', 'whatever'), '');
    assert.strictEqual(normalizeSub('unknown', 'whatever'), '');
  });

  test('her kanalın alt sekme listesi boş olsa bile tutarlı', () => {
    for (const ch of CHANNELS) assert.ok(Array.isArray(SUB_TABS[ch]));
    assert.deepStrictEqual(SUB_TABS.email, ['templates', 'identities', 'logs', 'test']);
    assert.deepStrictEqual(SUB_TABS.sms, ['templates', 'logs', 'test']);
  });
});

describe('normalizeLogRow — iki model tek tablo formatı', () => {
  test('e-posta: sentAt/to/subject/status', () => {
    const row = normalizeLogRow('email', {
      _id: 'm1', sentAt: '2026-10-03T10:00:00Z', to: 'a@b.c', subject: 'Hoş geldin',
      status: 'sent', trigger: 'action', event: 'welcome',
    });
    assert.strictEqual(row.id, 'm1');
    assert.strictEqual(row.time, '2026-10-03T10:00:00Z');
    assert.strictEqual(row.recipient, 'a@b.c');
    assert.strictEqual(row.content, 'Hoş geldin');
    assert.strictEqual(row.status, 'sent');
    assert.strictEqual(row.event, 'welcome');
    assert.strictEqual(row.username, '');
  });

  test('e-posta: bilinmeyen durum güvenli şekilde failed olur (asla undefined)', () => {
    assert.strictEqual(normalizeLogRow('email', { status: 'weird' }).status, 'failed');
    assert.strictEqual(normalizeLogRow('email', {}).status, 'failed');
    assert.strictEqual(normalizeLogRow('email', { status: 'mock' }).status, 'mock');
  });

  test('sms: createdAt/phone/body — mock durumu yoktur', () => {
    const row = normalizeLogRow('sms', {
      _id: 's1', createdAt: '2026-10-03T11:00:00Z', phone: '+905…', body: 'Merhaba',
      username: 'ali', status: 'sent', audienceType: 'all', templateKey: 'deposit_reminder',
    });
    assert.strictEqual(row.time, '2026-10-03T11:00:00Z');
    assert.strictEqual(row.recipient, '+905…');
    assert.strictEqual(row.content, 'Merhaba');
    assert.strictEqual(row.username, 'ali');
    assert.strictEqual(row.trigger, 'all');
    assert.strictEqual(row.event, 'deposit_reminder');
    assert.strictEqual(normalizeLogRow('sms', { status: 'mock' }).status, 'failed');
  });

  test('LOG_STATUSES iki kanalın kesişimi değil (mock yalnız e-posta)', () => {
    assert.ok(LOG_STATUSES.includes('mock'));
    assert.ok(!['sent', 'failed', 'skipped'].some(s => !LOG_STATUSES.includes(s)));
  });
});

describe('normalizeAutomationRows — olay kataloğu', () => {
  test('mail + sms aksiyon + sms zamanlama tek listede, kanal/tür/olay sırasıyla', () => {
    const rows = normalizeAutomationRows({
      mailEvents: [
        { event: 'welcome', category: 'action', variables: ['username'], usedBy: 'Hoş geldin' },
        { event: 'weekly', category: 'scheduled', variables: [], usedBy: null },
      ],
      smsEvents: {
        action: [{ key: 'kyc_reminder', variables: ['username'] }],
        scheduled: [{ key: 'weekly_sms', variables: [] }],
      },
      smsTemplates: [{ eventKey: 'kyc_reminder', title: 'KYC Hatırlatma' }],
    });
    assert.strictEqual(rows.length, 4);
    assert.deepStrictEqual(rows.map(r => `${r.channel}:${r.type}`), [
      'email:action', 'email:scheduled', 'sms:action', 'sms:scheduled',
    ]);
    const smsAction = rows.find(r => r.event === 'kyc_reminder');
    assert.strictEqual(smsAction.usedBy, 'KYC Hatırlatma');
    const mail = rows.find(r => r.event === 'welcome');
    assert.strictEqual(mail.usedBy, 'Hoş geldin');
    assert.strictEqual(rows.find(r => r.event === 'weekly').usedBy, null);
  });

  test('boş girdi → boş liste (panel boş durumu gösterir)', () => {
    assert.deepStrictEqual(normalizeAutomationRows(), []);
    assert.deepStrictEqual(normalizeAutomationRows({ mailEvents: [], smsEvents: {} }), []);
  });
});

describe('normalizeCampaignRows — zamana duyarlı gönderimler', () => {
  test('yalnız scheduled e-posta + type=scheduled SMS satırı alınır', () => {
    const rows = normalizeCampaignRows({
      mailTemplates: [
        { _id: 'm1', category: 'scheduled', name: 'Haftalık', enabled: true, schedule: { enabled: true, intervalHours: 168 }, audience: { type: 'segments' }, stats: { sentCount: 12 } },
        { _id: 'm2', category: 'action', name: 'Hoş geldin' },
      ],
      smsTemplates: [
        { _id: 's1', type: 'scheduled', title: 'Kayıp Bonusu', isActive: true, sentCount: 3 },
        { _id: 's2', type: 'action', title: 'KYC' },
        { _id: 's3', type: 'scheduled', title: 'Otomatik Duyuru', isActive: true, schedule: { enabled: true, intervalHours: 24, nextSentAt: '2026-10-07T00:00:00Z' }, audience: { type: 'segment' } },
      ],
    });
    assert.strictEqual(rows.length, 3);
    const mail = rows.find(r => r.channel === 'email');
    const sms = rows.find(r => r.id === 's1');
    const smsAuto = rows.find(r => r.id === 's3');
    assert.strictEqual(mail.auto, true);
    assert.strictEqual(mail.intervalHours, 168);
    assert.strictEqual(mail.audience, 'segments');
    // schedule yoksa satır manuel: auto false, interval null
    assert.strictEqual(sms.auto, false);
    assert.strictEqual(sms.intervalHours, null);
    assert.strictEqual(sms.audience, 'all');
    assert.strictEqual(sms.name, 'Kayıp Bonusu');
    // schedule.enabled açıksa SMS satırı da otomatiktir (e-posta ile aynı model)
    assert.strictEqual(smsAuto.auto, true);
    assert.strictEqual(smsAuto.intervalHours, 24);
    assert.strictEqual(smsAuto.audience, 'segment');
    assert.strictEqual(smsAuto.nextSentAt, '2026-10-07T00:00:00Z');
  });

  test('sıralama: otomatik zamanlı önce, sonra son gönderime göre yeniden', () => {
    const rows = normalizeCampaignRows({
      mailTemplates: [
        { _id: 'old', category: 'scheduled', name: 'Eski', schedule: { enabled: false }, lastSentAt: undefined, stats: { lastSentAt: '2026-01-01T00:00:00Z' } },
        { _id: 'auto', category: 'scheduled', name: 'Otomatik', schedule: { enabled: true } },
        { _id: 'new', category: 'scheduled', name: 'Yeni', schedule: { enabled: false }, stats: { lastSentAt: '2026-10-01T00:00:00Z' } },
      ],
    });
    assert.deepStrictEqual(rows.map(r => r.name), ['Otomatik', 'Yeni', 'Eski']);
  });

  test('girdi yoksa hata fırlatmaz', () => {
    assert.deepStrictEqual(normalizeCampaignRows(), []);
  });
});

describe('audienceLabelKey — bilinmeyen değer sessizce all olur', () => {
  test('e-posta: all/segments/users/inactive + bilinmeyen → all', () => {
    assert.strictEqual(audienceLabelKey('email', 'segments'), 'admin.communications.audience.segments');
    assert.strictEqual(audienceLabelKey('email', { type: 'inactive' }), 'admin.communications.audience.inactive');
    assert.strictEqual(audienceLabelKey('email', 'bogus'), 'admin.communications.audience.all');
    assert.strictEqual(audienceLabelKey('email', undefined), 'admin.communications.audience.all');
  });

  test('sms: all/segment/users (segments DEĞİL) + bilinmeyen → all', () => {
    assert.strictEqual(audienceLabelKey('sms', 'segment'), 'admin.communications.audience.segment');
    assert.strictEqual(audienceLabelKey('sms', 'segments'), 'admin.communications.audience.all');
    assert.strictEqual(audienceLabelKey('sms', 'users'), 'admin.communications.audience.users');
    assert.strictEqual(audienceLabelKey('sms', null), 'admin.communications.audience.all');
  });
});

describe('identityRows — gönderen kimliği (salt-okunur)', () => {
  const t = key => `T:${key}`;

  test('provider alan yoksa host\'tan çıkarılır; secure boolean olarak yorumlanır', () => {
    const rows = identityRows([
      { key: 'host', value: 'smtp.mailgun.org', source: 'env' },
      { key: 'port', value: '587', source: 'db' },
      { key: 'secure', value: 'true', source: 'db' },
      { key: 'from', value: 'noreply@vip90.bet', source: 'db' },
    ], t);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    assert.strictEqual(byKey.provider.value, 'T:admin.emailSettings.provider.mailgun');
    assert.strictEqual(byKey.secure.value, 'T:common.yes');
    assert.strictEqual(byKey.from.value, 'noreply@vip90.bet');
    assert.strictEqual(byKey.from.source, 'db');
    assert.strictEqual(byKey.user.value, null);
    assert.strictEqual(byKey.user.source, 'unset');
    assert.strictEqual(byKey.host.mono, true);
  });

  test('kayıtlı provider alanı host\'u ezer; alan yoksa false → common.no', () => {
    const rows = identityRows([
      { key: 'provider', value: 'postmark', source: 'db' },
      { key: 'host', value: 'smtp.mailgun.org', source: 'env' },
      { key: 'secure', value: 'false', source: 'db' },
    ], t);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
    assert.strictEqual(byKey.provider.value, 'T:admin.emailSettings.provider.postmark');
    assert.strictEqual(byKey.secure.value, 'T:common.no');
  });

  test('boş settings → tüm satırlar unset/boş (çökmez)', () => {
    const rows = identityRows([], t);
    assert.strictEqual(rows.length, 7);
    assert.ok(rows.every(r => r.source === 'unset'));
    assert.strictEqual(rows[0].value, 'T:admin.emailSettings.provider.custom');
  });
});
