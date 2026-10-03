import { test, describe } from 'node:test';
import assert from 'node:assert';
import { computeMenuPosition, nextFocusIndex, toneClass, runItem } from './rowActionsLogic.js';

const vp = { width: 1000, height: 800 };
const menu = { width: 180, height: 120 };

describe('computeMenuPosition', () => {
  test('varsayılan: butonun altında, sağ kenar hizalı', () => {
    const p = computeMenuPosition({ left: 800, right: 832, top: 100, bottom: 132 }, menu, vp);
    assert.deepStrictEqual(p, { top: 136, left: 652, openUp: false });
  });
  test('alta sığmazsa yukarı açılır', () => {
    const p = computeMenuPosition({ left: 800, right: 832, top: 740, bottom: 772 }, menu, vp);
    assert.strictEqual(p.openUp, true);
    assert.strictEqual(p.top, 740 - 4 - 120);
  });
  test('sola sığmazsa viewport içinde kalır', () => {
    const p = computeMenuPosition({ left: 4, right: 36, top: 100, bottom: 132 }, menu, vp);
    assert.ok(p.left >= 8 && p.left + menu.width <= vp.width - 8);
  });
  test('dar ekranda (390) taşmaz', () => {
    const p = computeMenuPosition({ left: 350, right: 382, top: 100, bottom: 132 }, menu, { width: 390, height: 700 });
    assert.ok(p.left >= 8 && p.left + menu.width <= 382);
  });
});

describe('nextFocusIndex', () => {
  const items = [{}, { disabled: true }, {}, {}];
  test('ArrowDown devre dışıyı atlar ve döner', () => {
    assert.strictEqual(nextFocusIndex(items, 0, 'ArrowDown'), 2);
    assert.strictEqual(nextFocusIndex(items, 3, 'ArrowDown'), 0);
  });
  test('ArrowUp başa gelince sona sarar', () => {
    assert.strictEqual(nextFocusIndex(items, 0, 'ArrowUp'), 3);
  });
  test('Home/End', () => {
    assert.strictEqual(nextFocusIndex(items, 2, 'Home'), 0);
    assert.strictEqual(nextFocusIndex(items, 0, 'End'), 3);
  });
  test('hepsi devre dışıysa -1', () => {
    assert.strictEqual(nextFocusIndex([{ disabled: true }], 0, 'ArrowDown'), -1);
  });
});

describe('toneClass / runItem', () => {
  test('ton sınıfları', () => {
    assert.match(toneClass('danger'), /text-danger/);
    assert.match(toneClass('success'), /text-success/);
    assert.match(toneClass(undefined), /text-text-1/);
  });
  test('runItem doğru handler çağırır, disabled çağırmaz', () => {
    let n = 0;
    assert.strictEqual(runItem({ onClick: () => { n += 1; } }), true);
    assert.strictEqual(runItem({ disabled: true, onClick: () => { n += 10; } }), false);
    assert.strictEqual(n, 1);
  });
});
