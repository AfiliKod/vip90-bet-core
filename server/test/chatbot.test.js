import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildGroundedSystemPrompt, answerQuestion, ESCALATION_MESSAGE } from '../src/services/chatbot.js';

const chunks = [
  { heading: 'Kurulum', text: 'Node.js 20 ve MongoDB 6 gereklidir.', source: 'kurulum.md' },
];

describe('buildGroundedSystemPrompt', () => {
  test('alınan parçaların metnini içerir', () => {
    const prompt = buildGroundedSystemPrompt({ chunks, version: '0.2.0' });
    assert.ok(prompt.includes('Node.js 20 ve MongoDB 6 gereklidir.'));
  });

  test('mevcut sürüm numarasını içerir — sürüm farkını bilerek cevap kriteri', () => {
    const prompt = buildGroundedSystemPrompt({ chunks, version: '0.2.0' });
    assert.ok(prompt.includes('0.2.0'));
  });

  test('bilmediği konuda insana yönlendirme talimatı taşır', () => {
    const prompt = buildGroundedSystemPrompt({ chunks, version: '0.2.0' });
    assert.match(prompt, /bilmiyorsan|emin değilsen|destek/i);
  });
});

describe('answerQuestion', () => {
  test('alakalı parça bulunursa LLM çağrılır, köklenmiş cevap döner', async () => {
    let calledWith = null;
    const callLLM = async (systemPrompt, query) => { calledWith = { systemPrompt, query }; return 'Node.js 20 gerekli.'; };
    const result = await answerQuestion({
      query: 'kurulum için ne gerekli', allChunks: chunks, version: '0.2.0', callLLM,
    });
    assert.strictEqual(result.escalated, false);
    assert.strictEqual(result.reply, 'Node.js 20 gerekli.');
    assert.ok(calledWith.systemPrompt.includes('Node.js 20 ve MongoDB 6'));
  });

  test('hiçbir parça bulunamazsa LLM HİÇ ÇAĞRILMAZ, deterministik yönlendirme döner', async () => {
    let called = false;
    const callLLM = async () => { called = true; return 'x'; };
    const result = await answerQuestion({
      query: 'yıldız burcu falı bugün ne diyor', allChunks: chunks, version: '0.2.0', callLLM,
    });
    assert.strictEqual(called, false);
    assert.strictEqual(result.escalated, true);
    assert.strictEqual(result.reply, ESCALATION_MESSAGE);
  });

  test('LLM çağrısı patlarsa hata yutulmaz, çağırana iletilir', async () => {
    const callLLM = async () => { throw new Error('API zaman aşımı'); };
    await assert.rejects(
      () => answerQuestion({ query: 'kurulum', allChunks: chunks, version: '0.2.0', callLLM }),
      /API zaman aşımı/,
    );
  });

  test('boş sorgu escalate eder, LLM çağrılmaz', async () => {
    let called = false;
    const callLLM = async () => { called = true; };
    const result = await answerQuestion({ query: '', allChunks: chunks, version: '0.2.0', callLLM });
    assert.strictEqual(called, false);
    assert.strictEqual(result.escalated, true);
  });
});
