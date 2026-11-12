import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILES_TO_CHECK = [
  'client/src/components/Footer.jsx',
  'client/src/components/LiveHelp.jsx',
  'client/src/components/Navbar.jsx',
  'client/src/components/home/PromoHeroSlider.jsx',
  'client/src/pages/HomePage.jsx',
  'client/src/pages/Login.jsx',
];

test('no component contains hard-coded VIP90 fallback literals', () => {
  for (const file of FILES_TO_CHECK) {
    const content = readFileSync(resolve(process.cwd(), file), 'utf8');
    const hasHardcodedFallback = /\|\|\s*['"]VIP90(?:\.bet)?['"]/i.test(content);
    assert.equal(
      hasHardcodedFallback,
      false,
      `File ${file} still contains hard-coded brand fallback`
    );
  }
});