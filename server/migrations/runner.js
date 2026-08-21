/**
 * K4 — Migration koşucusu çekirdeği.
 *
 * D9'un `registerUpdateHandler`'ı gerçek dosya/migration uygulamasını
 * `applyMigration({ version, manifest })` imzasıyla enjekte edilebilir
 * bekliyor — bu modülün `createApplyMigration`'ı tam o sözleşmeyi sağlar.
 *
 * Güvenceler (kabul kriteri: sıralı, idempotent, veri kaybısız):
 * - Sıralama semver sayısal (0.10.0 > 0.9.0), dosya adına güvenilmez.
 * - Her migration başarıdan SONRA işaretlenir; patlayan işaretlenmez,
 *   bir sonraki koşu kaldığı yerden devam eder.
 * - Zaten işaretli olanlar atlanır (idempotent).
 */

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

/**
 * @param {Array<{version:string,name:string,up:Function}>} migrations
 * @param {() => Promise<string[]>} getApplied — işaretli migration adları
 * @param {(m:{name:string,version:string}) => Promise<void>} markApplied
 */
export function createMigrationRunner({ migrations, getApplied, markApplied }) {
  const sorted = [...migrations].sort(
    (a, b) => compareVersions(a.version, b.version) || String(a.name).localeCompare(String(b.name)),
  );

  async function pending() {
    const applied = new Set(await getApplied());
    return sorted.filter(m => !applied.has(m.name));
  }

  /**
   * @param {{targetVersion?:string, onApply?:(m)=>void}} opts
   * targetVersion verilirse yalnızca o sürüme DAHİL (≤) migration'lar koşar.
   */
  async function applyAll({ targetVersion, onApply } = {}) {
    const appliedSet = new Set(await getApplied());
    const awaiting = sorted.filter(m => !appliedSet.has(m.name));
    const applicable = targetVersion
      ? awaiting.filter(m => compareVersions(m.version, targetVersion) <= 0)
      : awaiting;
    // Zaten uygulanmış olduğu için atlananlar (hedefin üzerindekiler dahil değil)
    const skipped = sorted.filter(m =>
      appliedSet.has(m.name) &&
      (!targetVersion || compareVersions(m.version, targetVersion) <= 0)
    ).length;

    const applied = [];
    for (const m of applicable) {
      await m.up(); // patlarsa aşağıdaki markApplied çalışmaz → retry buradan devam eder
      await markApplied({ name: m.name, version: m.version });
      applied.push({ name: m.name, version: m.version });
      if (onApply) onApply(m);
    }
    return { applied, skipped };
  }

  return { pending, applyAll };
}

/**
 * registerUpdateHandler sözleşmesi: applyMigration({ version, manifest }).
 * Manifest D9 tarafından doğrulanmış gelir; bu katman DB migration'larını
 * hedef sürüme kadar uygular.
 */
export function createApplyMigration({ loadMigrations, getApplied, markApplied }) {
  return async function applyMigration({ version }) {
    const migrations = await loadMigrations();
    const runner = createMigrationRunner({ migrations, getApplied, markApplied });
    return runner.applyAll({ targetVersion: version });
  };
}
