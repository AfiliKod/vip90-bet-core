/**
 * Güncelleme paketi doğrulama (D9).
 *
 * Paket, D6/D7'nin mevcut kontratını (Action-ID kataloğu, imza, temsilci
 * onayı) aynen kullanır — 'APPLY_UPDATE' kayıtlı bir yıkıcı eylemdir (bkz.
 * actionCatalog.js), imza+onay zorunluluğu localAgent.tick() tarafından
 * zaten uygulanır. Bu dosya yalnızca güncellemeye ÖZGÜ ek denetimleri
 * (manifest şekli, sürüm monotonluğu) sağlar; registerUpdateHandler bunu
 * gerçek dosya uygulamasına (K4'ün migration runner'ı, enjekte edilir)
 * bağlar.
 */

export function assertValidManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error('Güncelleme manifesti boş olamaz');
  }
  for (const entry of manifest) {
    if (typeof entry?.file !== 'string' || typeof entry?.checksum !== 'string') {
      throw new Error('Manifest girdisi geçersiz: her girdi "file" ve "checksum" taşımalı');
    }
  }
}

/** Basit major.minor.patch karşılaştırması — candidate current'tan yeni mi. */
export function isNewerVersion(candidate, current) {
  const c = candidate.split('.').map(Number);
  const cur = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((c[i] || 0) > (cur[i] || 0)) return true;
    if ((c[i] || 0) < (cur[i] || 0)) return false;
  }
  return false;
}


/**
 * 'APPLY_UPDATE' eylemini bir kayıt defterine (D6'nın localAgent registry'si)
 * kaydeder. Gerçek dosya/migration uygulaması `applyMigration` ile enjekte
 * edilir — K4'ün migration runner'ı hazır olduğunda buraya bağlanacak.
 * İmza ve temsilci onayı burada DEĞİL, localAgent.tick() + approvalGate'te
 * zaten zorunlu (APPLY_UPDATE kataloğa yıkıcı olarak kayıtlı).
 */
export function registerUpdateHandler(registry, { applyMigration, currentVersion }) {
  registry.register('APPLY_UPDATE', async ({ version, manifest }) => {
    assertValidManifest(manifest);
    if (!isNewerVersion(version, currentVersion())) {
      throw new Error(`Sürüm ${version}, mevcut sürümden (${currentVersion()}) yeni değil — güncelleme reddedildi`);
    }
    return applyMigration({ version, manifest });
  });
}
