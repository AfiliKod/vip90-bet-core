/**
 * Lokal bakım ajanı — pull döngüsü + imzalı Action-ID icrası (D6).
 *
 * Tek bir tur (`tick`) şu sırayla ilerler ve HER adımda erken çıkabilir:
 *   1. Ajan kapalıysa (panelden kapatılabilir) hiçbir ağ çağrısı yapılmaz.
 *   2. Bekleyen komut yoksa sessizce geçer.
 *   3. İmza geçersizse (yanlış anahtar / payload değiştirilmiş) ÇALIŞTIRILMAZ.
 *   4. actionId kayıt defterinde yoksa ÇALIŞTIRILMAZ.
 *   5. Ancak tüm kontrollerden geçen komut çalıştırılır.
 *
 * `pull`, `isEnabled` dışarıdan enjekte edilir — gerçek implementasyon
 * merkeze HTTP GET atar (services/support, D8'de WAF'ın arkasına alınır);
 * burada saf orkestrasyon mantığı test edilir, ağa çıkmadan.
 */
import { verifyCommand } from './signature.js';

export function createLocalAgent({ registry, publicKey, pull, isEnabled = async () => true }) {
  async function tick() {
    if (!(await isEnabled())) return { skipped: 'disabled' };

    const command = await pull();
    if (!command) return { skipped: 'no-command' };

    if (!verifyCommand(command, publicKey)) {
      return { rejected: 'invalid-signature', actionId: command.actionId };
    }
    if (!registry.has(command.actionId)) {
      return { rejected: 'unknown-action', actionId: command.actionId };
    }

    try {
      const result = await registry.execute(command.actionId, command.params);
      return { executed: command.actionId, result };
    } catch (e) {
      return { error: e.message, actionId: command.actionId };
    }
  }

  return { tick };
}
