#!/usr/bin/env node
/**
 * Turkish text detection script for i18n migration
 * Finds all Turkish strings in JS/JSX files that need translation
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src');
const EXTENSIONS = ['.js', '.jsx'];
const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'i18n/dictionaries'];
const EXCLUDE_FILES = ['i18n.js', 'sportMeta.js'];

// Turkish character detection
const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;

// Common Turkish words/patterns to detect
const TURKISH_PATTERNS = [
  /\b(ve|veya|ile|için|bu|şu|o|bir|veya|ama|fakat|lakin|çünkü|eğer|ise|ise|ki|de|da|te|ta|mi|mı|mu|mü)\b/gi,
  /\b(veya|eğer|ise|ise|çünkü|ama|fakat|lakin|ile|için|bir|bu|şu|o|ve)\b/gi,
  /\b(şu an|şimdi|daha sonra|önce|sonra|hemen|az önce|az sonra)\b/gi,
  /\b(tamam|tamamdır|olur|olmaz|evet|hayır|var|yok)\b/gi,
];

function shouldProcessFile(filePath) {
  const ext = extname(filePath);
  if (!EXTENSIONS.includes(ext)) return false;
  const relPath = relative(ROOT_DIR, filePath);
  if (EXCLUDE_DIRS.some(dir => relPath.includes(dir))) return false;
  if (EXCLUDE_FILES.some(f => relPath.endsWith(f))) return false;
  return true;
}

function getAllFiles(dir) {
  let files = [];
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(item)) {
        files = files.concat(getAllFiles(fullPath));
      }
    } else if (shouldProcessFile(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function findTurkishStrings(content, filePath) {
  const results = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Skip comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('import ') || trimmed.startsWith('export ') || trimmed.startsWith('const ') || trimmed.startsWith('const')) continue;
    
    // Check for Turkish characters
    if (TURKISH_CHARS.test(line)) {
      // Try to extract string literals
      const stringMatches = line.match(/(['"`])([^'"`]*[çğıöşüÇĞİÖŞÜ][^'"`]*)\1/g);
      if (stringMatches) {
        for (const match of stringMatches) {
          results.push({
            file: filePath,
            line: lineNum,
            match: match,
            lineContent: line.trim()
          });
        }
      }
    }
    
    // Also check for Turkish words in string literals (even without Turkish chars)
    const stringLiterals = line.match(/(['"`])([^'"`]+)\1/g);
    if (stringLiterals) {
      for (const literal of stringLiterals) {
        const content = literal.slice(1, -1); // Remove quotes
        // Check for Turkish words
        const hasTurkishWord = TURKISH_PATTERNS.some(p => p.test(content));
        if (hasTurkishWord && content.length > 3) {
          // Additional check: not a key, not a technical string
          if (!content.includes('.') && !content.match(/^[a-z_]+$/i) && !content.match(/^https?:\/\//)) {
            results.push({
              file: filePath,
              line: lineNum,
              match: literal,
              lineContent: line.trim(),
              type: 'word'
            });
          }
        }
      }
    }
  }
  return results;
}

function main() {
  console.log('Scanning for Turkish strings...');
  const files = getAllFiles(ROOT_DIR);
  console.log(`Found ${files.length} files to scan`);
  
  let allResults = [];
  
  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const results = findTurkishStrings(content, file);
      if (results.length > 0) {
        allResults = allResults.concat(results);
      }
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }
  
  console.log(`\nFound ${allResults.length} potential Turkish strings`);
  
  // Group by file
  const byFile = {};
  for (const r of allResults) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  }
  
  // Output results
  console.log('\n=== Files with Turkish strings ===\n');
  for (const [file, results] of Object.entries(byFile)) {
    const relPath = relative(ROOT_DIR, file);
    console.log(`\n📁 ${relPath} (${results.length} strings)`);
    for (const r of results) {
      console.log(`  L${r.line}: ${r.match}`);
    }
  }
  
  // Save to JSON for later use
  writeFileSync(
    join(process.cwd(), 'turkish-strings-report.json'),
    JSON.stringify(allResults, null, 2)
  );
  console.log('\n📄 Full report saved to turkish-strings-report.json');
}

main();