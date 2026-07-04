import assert from 'node:assert/strict';
import { isValidHex, buildTeamGradient } from './matchHeroColors.js';

// isValidHex
assert.equal(isValidHex('#EF0107'), true, 'geçerli büyük harf hex kabul edilmeli');
assert.equal(isValidHex('#fdb927'), true, 'geçerli küçük harf hex kabul edilmeli');
assert.equal(isValidHex('EF0107'), false, '# olmadan reddedilmeli');
assert.equal(isValidHex('#fff'), false, '3 haneli kısa hex reddedilmeli');
assert.equal(isValidHex(''), false, 'boş string reddedilmeli');
assert.equal(isValidHex(undefined), false, 'undefined reddedilmeli');
assert.equal(isValidHex(null), false, 'null reddedilmeli');

// buildTeamGradient
assert.equal(
  buildTeamGradient('#EF0107', '#fdb927'),
  'linear-gradient(120deg, #EF0107 0%, #fdb927 100%)',
  'iki geçerli renkten doğru gradient string üretilmeli'
);
assert.equal(buildTeamGradient('#EF0107', ''), null, 'away rengi eksikse null dönmeli');
assert.equal(buildTeamGradient('', '#fdb927'), null, 'home rengi eksikse null dönmeli');
assert.equal(buildTeamGradient('', ''), null, 'ikisi de eksikse null dönmeli');
assert.equal(buildTeamGradient('kirmizi', '#fdb927'), null, 'geçersiz hex formatı null dönmeli');

console.log('matchHeroColors.test.js: tüm assertion\'lar geçti');
