/**
 * Gönderici ekranının saf mantığı (`smsSenderLogic.js`) — node:test.
 *
 * `toKeySegment` i18n anahtar kuralına (`core.js` KEY_RE) uyumun tek
 * noktası: segmentlerde alt çizgi ve büyük harfle başlama yasak. Burada
 * sunucunun gerçek enum değerlerinin hepsi sınanır.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  toKeySegment,
  SENDER_BLOCK_REASONS,
  TWILIO_ERROR_MEANINGS,
} from './smsSenderLogic.js';

// i18n/core.js ile birebir aynı kural
const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

describe('toKeySegment — i18n anahtar uyumu', () => {
  test('sunucu enum değerleri geçerli anahtar segmentine dönüşür', () => {
    const cases = {
      long_code: 'longCode',
      short_code: 'shortCode',
      toll_free: 'tollFree',
      alphanumeric: 'alphanumeric',
      sender_id: 'senderId',
      messaging_service: 'messagingService',
      a2p_10dlc: 'a2p10dlc',
      local_sender_id: 'localSenderId',
      not_required: 'notRequired',
      not_submitted: 'notSubmitted',
      none: 'none',
      pending: 'pending',
      approved: 'approved',
    };
    for (const [input, expected] of Object.entries(cases)) {
      assert.strictEqual(toKeySegment(input), expected, input);
    }
  });

  test('SCREAMING_SNAKE hata/engel kodları da geçerli segment verir', () => {
    assert.strictEqual(toKeySegment('SMS_SENDER_NOT_REGISTERED'), 'smsSenderNotRegistered');
    assert.strictEqual(toKeySegment('SMS_TRIAL_NUMBER_NOT_VERIFIED'), 'smsTrialNumberNotVerified');
    assert.strictEqual(toKeySegment('SMS_INVALID_PHONE'), 'smsInvalidPhone');
    assert.strictEqual(toKeySegment('A2P_10DLC'), 'a2p10dlc');
  });

  test('sadece harf/rakam kalır — tire ve boşluk temizlenir', () => {
    assert.strictEqual(toKeySegment('not-a-key'), 'notakey');
    assert.strictEqual(toKeySegment('with space'), 'withspace');
    assert.strictEqual(toKeySegment(''), '');
    assert.strictEqual(toKeySegment(null), '');
    assert.strictEqual(toKeySegment(undefined), '');
  });

  test('her blok nedeni geçerli i18n anahtarı üretir', () => {
    for (const reason of SENDER_BLOCK_REASONS) {
      const key = `admin.smsSenders.reason.${toKeySegment(reason)}`;
      assert.match(key, KEY_RE, `geçersiz anahtar: ${key}`);
    }
  });

  test('her Twilio hata anlamı geçerli i18n anahtarı üretir', () => {
    for (const meaning of TWILIO_ERROR_MEANINGS) {
      const key = `admin.smsSenders.twilioError.${toKeySegment(meaning)}`;
      assert.match(key, KEY_RE, `geçersiz anahtar: ${key}`);
    }
  });

  test('sözleşme: girdi HER ZAMAN ham sunucu değeridir (kendi çıktısını geri yemiyoruz)', () => {
    // Fonksiyon girdiyi önce TAMAMEN küçülttüğü için kendi çıktısını geri
    // beslemezsen idempotent değildir — bu kasıtlıdır: tek işi, ham sunucu
    // enum'ını (snake_case / SCREAMING_SNAKE) i18n segmentine indirmektir.
    // Yanlışlıkla iki kez uygulanırsa farklı anahtar üretir; bu yüzden çağrı
    // yerleri tek bir JSX ifadesiyle sınırlıdır.
    assert.strictEqual(toKeySegment('long_code'), 'longCode');
    assert.notStrictEqual(toKeySegment('long_code'), toKeySegment(toKeySegment('long_code')));
  });

  test('farklı kaynak değerleri aynı segmente çakışmaz', () => {
    const all = [...SENDER_BLOCK_REASONS, ...TWILIO_ERROR_MEANINGS, 'long_code', 'a2p_10dlc', 'not_required'];
    const mapped = all.map(toKeySegment);
    assert.strictEqual(new Set(mapped).size, mapped.length, 'çakışan segment var');
  });
});