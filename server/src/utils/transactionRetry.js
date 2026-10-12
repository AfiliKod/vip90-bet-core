/**
 * MongoDB multi-document transaction'ları için resmi retry deseni
 * (bkz. https://www.mongodb.com/docs/manual/core/transactions-in-applications/).
 *
 * TransientTransactionError: taze bir koleksiyon transaction İÇİNDE ilk kez
 * oluşturulurken ("catalog changes") ya da yazma çakışmasında görülen GEÇİCİ
 * bir hata — driver bunu errorLabels ile açıkça retryable olarak işaretler.
 * Yeniden denemeden bırakılırsa taze bir kurulumda (ör. Docker installer'da
 * ilk bahis sonuçlandırması/çekim, koleksiyonlar henüz yokken) transaction
 * tamamen başarısız olabiliyor (2026-09-16'da Docker installer
 * doğrulamasında bulundu — yoğun ardışık test yükü altında sabit gecikmesiz
 * birkaç deneme bile yetmiyordu, bu yüzden artan bekleme süresi eklendi).
 */

// 2026-10-12: aynı oyuncunun eşzamanlı işlemleri (paralel kupon/çekim) aynı
// kullanıcı belgesine yazdığı için WriteConflict üretir. Sabit artan gecikme
// (30·n ms) yeniden denemeleri aynı anlara dizip tekrar çarpıştırıyor, 8
// deneme tükenip oyuncuya 500 dönüyordu (test/rgConcurrency.test.js). Üstel
// artan tavan + tam rastgele sapma ("full jitter") denemeleri dağıtır.
const MAX_RETRIES = 15;
const BASE_DELAY_MS = 20;
const MAX_DELAY_MS = 400;

export function retryDelay(attempt, random = Math.random) {
  const cap = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.floor(random() * cap) + 1;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function commitWithRetry(session) {
  while (true) {
    try {
      await session.commitTransaction();
      return;
    } catch (e) {
      if (e.hasErrorLabel?.('UnknownTransactionCommitResult')) continue;
      throw e;
    }
  }
}

/**
 * `fn(attempt)` bir transaction gövdesidir — `session.startTransaction()`
 * zaten çağrılmış haldeyken içeri girer, başarılıysa commit edilir. `fn`
 * TransientTransactionError ile başarısız olursa transaction'ın TAMAMI
 * (fn'in tüm gövdesi, yalnızca commit değil) artan gecikmeyle yeniden
 * denenir. `fn` her denemede fonksiyonun İÇİNDE taze veri okumalı — bir
 * önceki (abort edilmiş) denemede bellekte mutate edilmiş nesneleri
 * yeniden kullanmak, DB'de hiç commit olmamış değişiklikleri "zaten
 * uygulanmış" sanıp sessizce atlamaya yol açabilir.
 */
export async function withTransactionRetry(session, fn) {
  let attempt = 0;
  while (true) {
    attempt++;
    session.startTransaction();
    try {
      const result = await fn(attempt);
      await commitWithRetry(session);
      return result;
    } catch (e) {
      await session.abortTransaction().catch(() => {});
      if (e.hasErrorLabel?.('TransientTransactionError') && attempt < MAX_RETRIES) {
        await sleep(retryDelay(attempt));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Çağıran bir işlem (session) verdiyse gövdeyi onun içinde çalıştırır;
 * vermediyse kendi işlemini açar (withTransactionRetry ile). Bakiye ve defter
 * satırı böylece hep birlikte yazılır; eşzamanlı ikinci ödeme createTransaction'ın
 * işlem içi tekrar korumasına takılıp geri alınır.
 */
export async function runInTransaction(session, fn) {
  if (session) return fn(session);
  const { default: mongoose } = await import('mongoose');
  const own = await mongoose.startSession();
  try {
    return await withTransactionRetry(own, () => fn(own));
  } finally {
    await own.endSession();
  }
}
