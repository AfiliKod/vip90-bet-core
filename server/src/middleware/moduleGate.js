/**
 * M4 — Modül kapalıyken zarif bozulma.
 *
 * Bir modül kapalıyken ilgili API route'ları 404 ÜRETMEZ; anlamlı, makine-
 * okunur bir 503 döner: { error: { code: 'MODULE_DISABLED', module } }.
 * İstemci bu kodu yakalayıp nazik bir "bu bölüm kapalı" görünümü gösterir;
 * sitenin geri kalanı hatasız çalışmaya devam eder.
 *
 * "Kullanılabilir" = panel anahtarı açık (modules) VE lisans geçerli
 * (licensing) — isModuleUsable çift kapısı.
 */

export function createModuleGate({ isUsable, moduleId = 'unknown' }) {
  return async function moduleGate(req, res, next) {
    let usable = false;
    try {
      usable = await isUsable(moduleId);
    } catch {
      usable = false; // durum ölçülemedi → güvenli tarafta kal
    }
    if (!usable) {
      res.set('Cache-Control', 'no-store');
      return res.status(503).json({
        error: {
          code: 'MODULE_DISABLED',
          module: moduleId,
          message: 'Bu bölüm şu anda kullanılamıyor.',
        },
      });
    }
    next();
  };
}
