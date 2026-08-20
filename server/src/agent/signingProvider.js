/**
 * İmza sağlayıcı arayüzü (D8 — "imza anahtarı donanımda").
 *
 * Gerçek bir HSM/KMS entegrasyonu (AWS KMS, GCP Cloud HSM, PKCS#11 donanım
 * cihazı) burada KURULMUYOR — hangi sağlayıcının seçileceği, provisioning,
 * IAM/erişim politikası ve maliyeti bir operasyon/altyapı kararıdır ve bu
 * kod oturumunun kapsamı dışındadır.
 *
 * Kurulan şey: çağıran kodun (signCommandWithProvider) özel anahtarı HİÇ
 * GÖRMEDİĞİ, yalnızca `{ sign(buffer): Promise<Buffer> }` sözleşmesiyle
 * konuştuğu bir arayüz. Gerçek HSM/KMS sağlayıcısı bu sözleşmeyi uygulayan
 * ayrı bir modül olarak eklenir (ör. `createAwsKmsSigningProvider(keyArn)`)
 * — geri kalan kod (approvalGate, signature.js) hiç değişmez.
 *
 * Bu dosya yalnızca geliştirme/test için bellek-içi sağlayıcıyı içerir.
 */
import { sign as cryptoSign } from 'crypto';

export function createInMemorySigningProvider(privateKey) {
  return {
    async sign(canonicalPayloadBuffer) {
      return cryptoSign(null, canonicalPayloadBuffer, privateKey);
    },
  };
}
