/**
 * Scriptler için tek env kaynağı: `server/.env` — uygulamanın kendisinin
 * yüklediği dosya (app.js:10 `config({ path: join(__dirname,'server','.env') })`).
 *
 * Neden bu dosya: `import 'dotenv/config'` ve `resolve('../.env')` **cwd'ye**
 * bakar; belgelenen çağrı biçimi ise kökten çalıştırma —
 * `node server/scripts/migrate.js`, `node server/scripts/healthcheck.js`
 * (docs/product/01-kurulum.md). O çağrı production'da
 * `public_html/.env`i, dev'de kök `.env`i yükler; ikisinde de MONGODB_URI
 * ya bayat ya hiç yok, ve `.env.example`ın kopyalandığı yer kök olduğu için
 * yanlış dosyayı yüklemek sessizce olasıdır. `__dirname`'a dayalı `'../../.env'`
 * yazımı da aynı dosyaya düşüyordu (repo/decode kökü) — cwd'den bağımsız ama
 * yanlış dosya.
 *
 * Mevcut `config({ path: resolve(__dirname, '../.env') })` yazımı (scripts içinde
 * yaygın) AYNI dosyayı hedefler; yeni scriptler bu modülü kullansın diye buradayız.
 *
 * dotenv varsayılan olarak SET OLAN değeri ezmez: dışarıdan enjekte edilen
 * env (CI, `MONGODB_URI=... node ...`) her zaman kazanmaya devam eder.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/** `server/scripts/lib/env.mjs` → `server/.env` */
export const SERVER_ENV_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');

/** sunucu env'ini yükle; yüklenen dosyanın yolunu döner (log/test için) */
export function loadServerEnv() {
  config({ path: SERVER_ENV_FILE });
  return SERVER_ENV_FILE;
}

// Modül İMPORT EDİLDİĞİ anda yüklenir — eskiden kullanılan `import 'dotenv/config'`
// ile aynı sıralama semantiği: import bildirimi hangi satırdaysa, o import'tan
// önceki/sonraki modüllerin gövdesi değil TAMAMI önce Instantiate edilir; gövdede
// çağrılan bir fonksiyon ise tüm importlar değerlendirildikten sonra koşardı, yani
// modül düzeyinde `process.env` okuyan bir bağımlılık env'siz kalırdı.
// `loadServerEnv()` ayrıca dışa açık: açık yeniden yükleme/lȯg isteyen çağırır.
loadServerEnv();
