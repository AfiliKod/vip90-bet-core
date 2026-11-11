/**
 * Alıcı baskılama (`config/mailSuppression`) — demo/seed adreslerine hiçbir
 * yoldan mail gitmemesi. Uygulamanın iki bağlantı noktası ölçülür:
 * `services/email.js` (transport sınırı) ve `services/systemMail.js`
 * (kitle seçimi sorgusu). Gerçek sağlayıcı çağrısı yapılmaz.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SUPPRESSED_EMAIL_DOMAINS,
  suppressedEmailDomains,
  suppressedDomainPattern,
  isSuppressedRecipient,
  normalizeDomains,
} from '../src/config/mailSuppression.js';
import { sendEmail, sendTestEmail, _setCreateTransport, _setCreateMailtrapClient } from '../src/services/email.js';
import { resolveAudience } from '../src/services/systemMail.js';
import User from '../src/models/User.js';
import { emailConfig } from '../src/config/emailConfig.js';

describe('suppressedEmailDomains — liste çözümü', () => {
  test('env yoksa varsayılanlar: seed.local, test.local ve ayrılmış local TLD', () => {
    const list = suppressedEmailDomains({});
    assert.ok(list.includes('seed.local'));
    assert.ok(list.includes('test.local'));
    assert.ok(list.includes('local'), 'ayrık TLD coverage: her .local adresi');
  });

  test('MAIL_SUPPRESS_EMAIL_DOMAINS listeyi ezer; virgül ve boşluk tolere edilir', () => {
    assert.deepStrictEqual(
      suppressedEmailDomains({ MAIL_SUPPRESS_EMAIL_DOMAINS: ' Mailtrap.Example , junk.test ' }),
      ['mailtrap.example', 'junk.test'],
    );
  });

  test('anahtar TANIMLI ve boşsa baskılama tamamen kapalı (operatör tercihi)', () => {
    assert.deepStrictEqual(suppressedEmailDomains({ MAIL_SUPPRESS_EMAIL_DOMAINS: '' }), []);
    assert.equal(isSuppressedRecipient('a@seed.local', []), false);
  });

  test('normalizeDomains: tekil, küçük harf, baştaki nokta ve boş satir temizliği', () => {
    assert.deepStrictEqual(normalizeDomains(['.Seed.Local', 'seed.local', ' ', 'x.io']), ['seed.local', 'x.io']);
  });

  test('demo seed domaini varsayılan listede (userSeed.js ile sürüklenme yok)', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/services/demoData/userSeed.js', import.meta.url)), 'utf8');
    const seedDomain = src.match(/SEED_DOMAIN = '([^']+)'/)?.[1];
    assert.ok(seedDomain, 'userSeed.js içinde SEED_DOMAIN bulunamadı');
    assert.ok(DEFAULT_SUPPRESSED_EMAIL_DOMAINS.includes(seedDomain), `${seedDomain} baskılama listesinde olmalı`);
  });
});

describe('isSuppressedRecipient — hangi adrese gönderilir', () => {
  const D = ['seed.local', 'test.local', 'local'];

  test('seed/test ve her .local adresi baskılanır', () => {
    for (const e of ['a@seed.local', 'A@SEED.LOCAL', 'a@test.local', 'a@anything.local', 'a@sub.seed.local']) {
      assert.equal(isSuppressedRecipient(e, D), true, `${e} baskılanmalı`);
    }
  });

  test('gerçek adresler ve benzer yazımlar baskılanmaz', () => {
    for (const e of ['user@example.com', 'a@vip90.bet', 'a@seed.local.example.com', 'a@locally.example.com', 'a@seedXlocal']) {
      assert.equal(isSuppressedRecipient(e, D), false, `${e} gönderilmeli`);
    }
  });

  test('boş/eksik adres baskılamaz (yönetimi ayrı: gönderilecek adres yok)', () => {
    assert.equal(isSuppressedRecipient('', D), false);
    assert.equal(isSuppressedRecipient(undefined, D), false);
  });

  test('desen noktaları kaçırır: "seedXlocal" eşleşmez; liste boşsa desen null', () => {
    assert.equal(isSuppressedRecipient('a@seedXlocal', ['seed.local']), false);
    assert.equal(suppressedDomainPattern([]), null);
    assert.ok(suppressedDomainPattern(['seed.local']).includes('seed\\.local'), 'nokta kaçırılmalı');
  });
});

describe('email.js — transport sınırında baskılama', () => {
  function withProviders(cb) {
    const smtpBuilt = [];
    const mailtrapBuilt = [];
    const sent = [];
    _setCreateTransport((opts) => { smtpBuilt.push(opts); return { sendMail: async (m) => { sent.push(m); return {}; } }; });
    _setCreateMailtrapClient((opts) => { mailtrapBuilt.push(opts); return { send: async (m) => { sent.push(m); return { messages: [] }; } }; });
    const savedGetAll = emailConfig.getAll;
    emailConfig.getAll = async () => ({ token: 'tok', provider: 'mailtrap', from: 'postmaster@vip90.bet', fromName: 'VIP90', gatewayEnabled: 'true' });
    return (async () => {
      try { return await cb({ smtpBuilt, mailtrapBuilt, sent }); }
      finally {
        emailConfig.getAll = savedGetAll;
        _setCreateTransport(null);
        _setCreateMailtrapClient(null);
      }
    })();
  }

  test('seed.adrese gönderim sağlayıcıya hiç ulaşmaz, {mock, suppressed} döner', () =>
    withProviders(async ({ smtpBuilt, mailtrapBuilt, sent }) => {
      const res = await sendEmail({ to: 'oyuncu@seed.local', subject: 's', html: 'x' });
      assert.equal(res.mock, true);
      assert.equal(res.suppressed, true);
      assert.equal(mailtrapBuilt.length, 0, 'baskılanan alıcı için client kurulmamalı');
      assert.equal(smtpBuilt.length, 0, 'baskılanan alıcı için transport kurulmamalı');
      assert.equal(sent.length, 0, 'sağlayıcıya emisyon gitmemeli');
    }));

  test('normal adreste gönderim çalışmaya devam eder', () =>
    withProviders(async ({ sent }) => {
      const res = await sendEmail({ to: 'player@example.com', subject: 's', html: 'x' });
      assert.equal(res.suppressed, undefined);
      assert.equal(sent.length, 1);
    }));

  test('panelden test gönderimi baskılanmış adreste 400 luk kodla patlar (yanlış "gönderildi" izlenimi yok)', () =>
    withProviders(async () => {
      await assert.rejects(() => sendTestEmail('admin@seed.local'), e => e.code === 'MAIL_RECIPIENT_SUPPRESSED');
    }));

  test('baskılama, sağlayıcı çözümlemesinden ÖNCE gelir: providersız kurulumda bile SUPPRESSED döner', async () => {
    const savedGetAll = emailConfig.getAll;
    emailConfig.getAll = async () => ({ gatewayEnabled: 'true' }); // host de token de yok
    try {
      await assert.rejects(() => sendTestEmail('x@seed.local'), e => e.code === 'MAIL_RECIPIENT_SUPPRESSED');
      await assert.rejects(() => sendTestEmail('x@example.com'), e => e.code === 'MAIL_PROVIDER_NOT_CONFIGURED');
    } finally {
      emailConfig.getAll = savedGetAll;
    }
  });

  test('operatör listeyi boşaltırsa seed adrese de gider (kural kodda donmaz)', () =>
    withProviders(async ({ sent }) => {
      const saved = process.env.MAIL_SUPPRESS_EMAIL_DOMAINS;
      process.env.MAIL_SUPPRESS_EMAIL_DOMAINS = '';
      try {
        const res = await sendEmail({ to: 'oyuncu@seed.local', subject: 's', html: 'x' });
        assert.equal(res.suppressed, undefined);
        assert.equal(sent.length, 1);
      } finally {
        if (saved === undefined) delete process.env.MAIL_SUPPRESS_EMAIL_DOMAINS;
        else process.env.MAIL_SUPPRESS_EMAIL_DOMAINS = saved;
      }
    }));
});

describe('systemMail — kitle seçimi baskılanmış domainleri dışarıda bırakır', () => {
  test('resolveAudience sorgusu email.$not deseni taşır', async () => {
    const captured = [];
    const chain = () => {
      const q = {};
      for (const m of ['select', 'sort', 'limit']) q[m] = () => q;
      q.lean = async () => [];
      return q;
    };
    const savedFind = User.find;
    const savedCount = User.countDocuments;
    User.find = (filter) => { captured.push(filter); return chain(); };
    User.countDocuments = async () => 0;
    try {
      const { users } = await resolveAudience({ type: 'all' });
      assert.deepEqual(users, []);
      assert.equal(captured.length, 1, 'kitle seçimi tek sorgu çalıştırmalı');
      const not = captured[0].email.$not;
      assert.ok(not instanceof RegExp, 'email.$not regex olmalı');
      assert.equal(not.test('a@seed.local'), true);
      assert.equal(not.test('a@player.example.com'), false);
    } finally {
      User.find = savedFind;
      User.countDocuments = savedCount;
    }
  });

  test('baskılama kapalıyken $not eklenmez (tam liste operatöre açık)', async () => {
    const captured = [];
    const chain = () => {
      const q = {};
      for (const m of ['select', 'sort', 'limit']) q[m] = () => q;
      q.lean = async () => [];
      return q;
    };
    const savedEnv = process.env.MAIL_SUPPRESS_EMAIL_DOMAINS;
    const savedFind = User.find;
    const savedCount = User.countDocuments;
    process.env.MAIL_SUPPRESS_EMAIL_DOMAINS = '';
    User.find = (filter) => { captured.push(filter); return chain(); };
    User.countDocuments = async () => 0;
    try {
      await resolveAudience({ type: 'all' });
      assert.equal(captured[0].email.$not, undefined);
      assert.equal(captured[0].email.$exists, true, 'temel filtre korunur');
    } finally {
      User.find = savedFind;
      User.countDocuments = savedCount;
      if (savedEnv === undefined) delete process.env.MAIL_SUPPRESS_EMAIL_DOMAINS;
      else process.env.MAIL_SUPPRESS_EMAIL_DOMAINS = savedEnv;
    }
  });
});
