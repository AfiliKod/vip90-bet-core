import assert from 'node:assert/strict';
import { coordinatedRefresh, _reset } from './refreshCoordinator.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Test 1: eşzamanlı çağrılar TEK bir refresh'i paylaşır (rotation race fix) ───
{
  _reset();
  let calls = 0;
  const refreshFn = async () => { calls++; await sleep(10); return 'tokenX'; };

  const [a, b, c] = await Promise.all([
    coordinatedRefresh(refreshFn),
    coordinatedRefresh(refreshFn),
    coordinatedRefresh(refreshFn),
  ]);

  assert.equal(calls, 1, 'eşzamanlı 3 çağrı için refreshFn yalnızca 1 kez çalışmalı (single-flight)');
  assert.equal(a, 'tokenX', 'tüm çağrılar aynı sonucu almalı (a)');
  assert.equal(b, 'tokenX', 'tüm çağrılar aynı sonucu almalı (b)');
  assert.equal(c, 'tokenX', 'tüm çağrılar aynı sonucu almalı (c)');
}

// ─── Test 2: önceki refresh settle olduktan sonra yeni çağrı taze refresh tetikler ───
{
  _reset();
  let calls = 0;
  const refreshFn = async () => { calls++; await sleep(5); return 'tok'; };

  await coordinatedRefresh(refreshFn); // 1
  await coordinatedRefresh(refreshFn); // 2 — in-flight temizlenmiş olmalı

  assert.equal(calls, 2, 'settle sonrası yeni çağrı yeni bir refresh başlatmalı');
}

// ─── Test 3: refresh reddedilirse eşzamanlı çağrıların hepsi reddedilir, tek deneme yapılır ───
{
  _reset();
  let calls = 0;
  const failFn = async () => { calls++; await sleep(5); throw new Error('rotation fail'); };

  const results = await Promise.allSettled([
    coordinatedRefresh(failFn),
    coordinatedRefresh(failFn),
  ]);

  assert.equal(calls, 1, 'eşzamanlı başarısız çağrılar için de yalnızca 1 deneme yapılmalı');
  assert.equal(results[0].status, 'rejected', 'birinci çağrı reddedilmeli');
  assert.equal(results[1].status, 'rejected', 'ikinci çağrı da reddedilmeli');

  // hata sonrası in-flight temizlenmeli — sonraki çağrı yeni deneme yapabilmeli
  let calls2 = 0;
  const okFn = async () => { calls2++; return 'ok'; };
  const r = await coordinatedRefresh(okFn);
  assert.equal(r, 'ok', 'hatadan sonra yeni bir refresh başarıyla çalışabilmeli');
  assert.equal(calls2, 1, 'hatadan sonraki çağrı gerçekten yeni bir refresh olmalı');
}

console.log('✓ refreshCoordinator: tüm testler geçti (single-flight refresh)');
