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

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 30;

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
        await sleep(BASE_DELAY_MS * attempt);
        continue;
      }
      throw e;
    }
  }
}
