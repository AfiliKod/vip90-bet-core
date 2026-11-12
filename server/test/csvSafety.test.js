import test from 'node:test';
import assert from 'node:assert/strict';
import { csvText, csvNumber } from '../src/platform/utils/csv.js';

test('CSV text cells neutralise spreadsheet formulas and escape quotes', () => {
  assert.equal(csvText('=HYPERLINK("http://x.example.com")'), `"'=HYPERLINK(""http://x.example.com"")"`);
  assert.equal(csvText('+1'), `"'+1"`);
  assert.equal(csvText('-2'), `"'-2"`);
  assert.equal(csvText('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvText('plain "text"'), '"plain ""text"""');
  assert.equal(csvText(null), '""');
});

test('CSV number cells accept only finite numbers', () => {
  assert.equal(csvNumber(12.5), '12.5');
  assert.equal(csvNumber('=1+1'), '');
  assert.equal(csvNumber(-3), '-3');
});
