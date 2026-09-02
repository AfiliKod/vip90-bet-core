/**
 * Chatbot bilgi tabanının üretim bağlantısı (D3).
 *
 * docs/product/*.md ve CHANGELOG.md'yi okuyup parçalara ayırır, process
 * ömrü boyunca önbelleğe alır. Bu dosya kasıtlı olarak test edilmez —
 * saf mantık (chunkMarkdown, searchKnowledge, answerQuestion) zaten
 * kapsanıyor; burası yalnızca dosya sistemine ince bir bağlantı.
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { chunkMarkdown } from './chatbotKnowledge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const DOCS_DIR = path.join(ROOT, 'docs', 'product');

let _cachedChunks = null;
let _cachedVersion = null;

function loadKnowledgeBase() {
  const chunks = [];
  try {
    for (const file of readdirSync(DOCS_DIR)) {
      if (!file.endsWith('.md')) continue;
      const content = readFileSync(path.join(DOCS_DIR, file), 'utf8');
      chunks.push(...chunkMarkdown(content, file));
    }
  } catch (e) {
    console.warn('[Chatbot] Failed to read docs/product/:', e.message);
  }
  try {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    chunks.push(...chunkMarkdown(changelog, 'CHANGELOG.md'));
  } catch (e) {
    console.warn('[Chatbot] Failed to read CHANGELOG.md:', e.message);
  }
  return chunks;
}

function loadVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return pkg.version || 'bilinmiyor';
  } catch {
    return 'bilinmiyor';
  }
}

export function getKnowledgeChunks() {
  if (!_cachedChunks) _cachedChunks = loadKnowledgeBase();
  return _cachedChunks;
}

export function getCurrentVersion() {
  if (!_cachedVersion) _cachedVersion = loadVersion();
  return _cachedVersion;
}

/** Yalnız test/geliştirme amaçlı: önbelleği sıfırlar. */
export function _resetChatbotCache() {
  _cachedChunks = null;
  _cachedVersion = null;
}
