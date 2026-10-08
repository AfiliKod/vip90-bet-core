/**
 * Admin sidebar taksonomisi (`adminNav.config.js`) — node:test.
 *
 * Bu işte nav değişti: Engagement'daki `sms-templates` + `mail-templates`
 * öğeleri tek `communication` öğesine taşındı (İletişim sayfası). Grup
 * kuralları (docs/admin-redesign README §3: grup başına 2-7 öğe) ve
 * etiketlerin sözlükte olması da burada kilitlenir.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ADMIN_NAV_GROUPS } from './adminNav.config.js';
import tr from '../../i18n/dictionaries/tr.js';

describe('admin nav — yapı', () => {
  test('her öğenin etiketi, rotası ve ikonu var; etiket sözlükte', () => {
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        assert.ok(item.id, `id eksik (${group.id})`);
        assert.ok(item.to === '/admin' || item.to?.startsWith('/admin/'), `rota /admin/ değil → ${item.id}: ${item.to}`);
        assert.ok(item.icon, `ikon eksik → ${item.id}`);
        assert.match(item.labelKey, /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, `geçersiz etiket anahtarı → ${item.labelKey}`);
        assert.ok(item.labelKey in tr, `tr sözlükte yok → ${item.labelKey}`);
        assert.ok(group.labelKey in tr, `grup etiketi tr sözlükte yok → ${group.labelKey}`);
      }
    }
  });

  test('öğe ve rota kimlikleri benzersiz (çift kayıt yok)', () => {
    const ids = ADMIN_NAV_GROUPS.flatMap(g => g.items.map(i => i.id));
    assert.strictEqual(new Set(ids).size, ids.length, 'yinelenen nav id');
    const tos = ADMIN_NAV_GROUPS.flatMap(g => g.items.map(i => i.to));
    assert.strictEqual(new Set(tos).size, tos.length, 'yinelenen rota');
  });

  test('grup başına 2-7 öğe (topLevel tek-öğelik istisnası)', () => {
    for (const group of ADMIN_NAV_GROUPS) {
      const n = group.items.length;
      if (group.topLevel) {
        assert.ok(n <= 7, `${group.id}: topLevel grupta 7+ öğe`);
      } else {
        assert.ok(n >= 2 && n <= 7, `${group.id}: ${n} öğe (beklenen 2-7)`);
      }
    }
  });
});

describe('admin nav — İletişim taşınması', () => {
  const engagement = ADMIN_NAV_GROUPS.find(g => g.id === 'engagement');

  test('Engagement tek `communication` öğesi içerir, eski iki öğe YOK', () => {
    const ids = engagement.items.map(i => i.id);
    assert.ok(ids.includes('communication'), 'communication öğesi eksik');
    assert.ok(!ids.includes('mail-templates'), 'mail-templates nav\'da kalmamalı');
    assert.ok(!ids.includes('sms-templates'), 'sms-templates nav\'da kalmamalı');
  });

  test('communication → /admin/communications (nav etiketi İngilizce: Communication)', () => {
    const item = engagement.items.find(i => i.id === 'communication');
    assert.strictEqual(item.to, '/admin/communications');
    assert.strictEqual(item.labelKey, 'admin.nav.communication');
    assert.strictEqual(tr['admin.nav.communication'], 'Communication');
  });

  test('eski nav anahtarları artık hiçbir nav öğesinde kullanılmıyor', () => {
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        assert.ok(!['admin.nav.mailTemplates', 'admin.nav.smsTemplates'].includes(item.labelKey),
          `${item.id}: eski etiket anahtarı hâlâ kullanımda`);
      }
    }
  });
});
