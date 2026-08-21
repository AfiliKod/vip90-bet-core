import { test, describe } from 'node:test';
import assert from 'node:assert';
import { chunkMarkdown, searchKnowledge } from '../src/services/chatbotKnowledge.js';

describe('chunkMarkdown', () => {
  test('başlıklara göre parçalar, her parça başlığı + içeriği taşır', () => {
    const md = '# Kurulum\n\n## Gereksinimler\nNode.js 20 gerekli.\n\n## Adımlar\nnpm install çalıştırın.';
    const chunks = chunkMarkdown(md, 'kurulum.md');
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.some(c => c.heading === 'Gereksinimler' && c.text.includes('Node.js 20')));
    assert.ok(chunks.every(c => c.source === 'kurulum.md'));
  });

  test('başlıksız düz metni tek parça olarak alır', () => {
    const chunks = chunkMarkdown('Sadece düz metin, başlık yok.', 'x.md');
    assert.strictEqual(chunks.length, 1);
  });

  test('boş markdown boş dizi döner', () => {
    assert.deepStrictEqual(chunkMarkdown('', 'x.md'), []);
  });
});

describe('searchKnowledge', () => {
  const chunks = [
    { heading: 'Kurulum', text: 'Node.js 20 ve MongoDB 6 gereklidir. npm run install:all ile kurulur.', source: 'kurulum.md' },
    { heading: 'RTP Ayarları', text: 'House edge değerleri bugün kaynak kodda sabittir, panelden değiştirilemez.', source: 'oyun-matematigi.md' },
    { heading: 'Ödeme Yöntemleri', text: 'Banka havalesi ve USDT-TRC20 kripto yatırma kutuda gelir.', source: 'sss.md' },
  ];

  test('sorguyla örtüşen terimlere göre en alakalı parçayı ilk sıraya koyar', () => {
    const results = searchKnowledge('MongoDB kurulumu nasıl yapılır', chunks);
    assert.strictEqual(results[0].heading, 'Kurulum');
  });

  test('hiçbir terim örtüşmüyorsa boş dizi döner — "bilmiyorum" sinyali', () => {
    const results = searchKnowledge('yıldız burcu falı', chunks);
    assert.deepStrictEqual(results, []);
  });

  test('en fazla topN sonuç döner', () => {
    const results = searchKnowledge('kurulum ayarları ödeme', chunks, { topN: 1 });
    assert.strictEqual(results.length, 1);
  });

  test('boş sorgu boş dizi döner, throw etmez', () => {
    assert.deepStrictEqual(searchKnowledge('', chunks), []);
    assert.deepStrictEqual(searchKnowledge(null, chunks), []);
  });
});
