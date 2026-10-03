/**
 * SMS şablon sayfasının saf mantığı (`smsTemplateLogic.js`) — node:test.
 * React bileşeni render edilmeden, davranışın gerçekten ne olduğu sınanır.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  smsCharInfo,
  isGsm7,
  extractPlaceholders,
  unknownPlaceholders,
  TYPE_FILTERS,
  AUDIENCE_TYPES,
  CATEGORIES,
  GSM7_LIMIT,
  UNICODE_LIMIT,
} from './smsTemplateLogic.js';

describe('SMS karakter/segment sayacı', () => {
  test('GSM-7 metin 160 karaktere kadar tek segmenttir', () => {
    assert.strictEqual(isGsm7('Hello world 123'), true);
    assert.strictEqual(smsCharInfo('a'.repeat(GSM7_LIMIT)).segments, 1);
    assert.strictEqual(smsCharInfo('a'.repeat(GSM7_LIMIT)).overLimit, false);
    assert.strictEqual(smsCharInfo('a'.repeat(GSM7_LIMIT + 1)).segments, 2);
    assert.strictEqual(smsCharInfo('a'.repeat(GSM7_LIMIT + 1)).overLimit, true);
  });

  test('TÜRKÇE KARAKTERLER GSM-7 DEĞİLDİR: sınır 70\'e düşer', () => {
    // GSM 03.38'de ğ/Ğ/ş/Ş/ı/İ/ç YOK; Ç/ü/ö/Ü/Ö/Ä/ñ VAR (Ç büyük harf
    // temel kümede, küçük harfi tabloda yok — tuzak bir çift).
    // Sessizce "160 karakter" göstermek operatörü iki parçaya bölünmüş bir
    // mesajla baş başa bırakırdı.
    for (const ch of ['ğ', 'Ğ', 'ş', 'Ş', 'ı', 'İ', 'ç']) {
      assert.strictEqual(isGsm7(ch), false, `${ch} GSM-7 sayılmamalı`);
    }
    for (const ch of ['Ç', 'ü', 'Ü', 'ö', 'Ö', 'ä', 'Ä', 'ñ', 'Ñ']) {
      assert.strictEqual(isGsm7(ch), true, `${ch} GSM-7 sayılmalı`);
    }
    assert.strictEqual(isGsm7('agüö'), true);
    assert.strictEqual(isGsm7('ağüş'), false);

    const turkce = 'Kazandın 250 TL!';
    assert.strictEqual(isGsm7(turkce), false);
    assert.strictEqual(smsCharInfo(turkce).limit, UNICODE_LIMIT);
    assert.strictEqual(smsCharInfo(turkce).encoding, 'unicode');
    assert.strictEqual(smsCharInfo(turkce).segments, 1);
  });

  test('boş içerik 0 segmenttir, hata üretmez', () => {
    for (const empty of ['', null, undefined]) {
      const info = smsCharInfo(empty);
      assert.strictEqual(info.chars, 0);
      assert.strictEqual(info.segments, 0);
      assert.strictEqual(info.overLimit, false);
    }
  });

  test('sayım kod noktası bazlıdır (emoji tek karakter sayılır)', () => {
    // '👋' JS'te iki birim (surrogate pair) ama operatör E.164/segment
    // mantığında TEK karakterdir; 160'a bölen bir sayım yanlış olur.
    assert.strictEqual([...'👋'].length, 1);
    assert.strictEqual(smsCharInfo('👋'.repeat(70)).chars, 70);
    assert.strictEqual(smsCharInfo('👋'.repeat(70)).segments, 1);
  });
});

describe('placeholder çıkarma', () => {
  test('sıra korur, tekrarları eler, tek süslü parantez sayılmaz', () => {
    assert.deepStrictEqual(
      extractPlaceholders('{{username}} {{amount}} {{username}} {amount} {{ currency }}'),
      ['username', 'amount', 'currency'],
    );
  });

  test('tanımsız değişkenler raporlanır, username istisnadır', () => {
    assert.deepStrictEqual(
      unknownPlaceholders('{{username}} {{amount}} {{mystery}}', ['amount']),
      ['mystery'],
    );
    assert.deepStrictEqual(unknownPlaceholders('{{amount}}', ['amount']), []);
  });
});

describe('sabit listeler sunucu ile aynı kalmalı', () => {
  test('değerler', () => {
    assert.deepStrictEqual(TYPE_FILTERS, ['all', 'action', 'scheduled']);
    assert.deepStrictEqual(AUDIENCE_TYPES, ['users', 'all', 'segment']);
    assert.deepStrictEqual(CATEGORIES, ['system', 'betting', 'casino', 'wallet', 'promotion']);
  });
});