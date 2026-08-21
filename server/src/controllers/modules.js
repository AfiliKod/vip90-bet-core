/**
 * M3 — Admin modül ekranının HTTP yüzeyi.
 *
 * GET  /admin/modules          → modül listesi (durum + lisans birleşik)
 * PATCH /admin/modules/:id     → aç/kapa (setModuleEnabled)
 * POST /admin/modules/refresh  → modül + lisans önbelleğini tazele
 *
 * Handler'lar DI'lı fabrikadan gelir; varsayılan router gerçek depoları
 * bağlar. admin.js'e dokunmadan kendi router'ıyla mount edilir — Akış B'nin
 * alanıyla çakışmaz.
 */
import { Router } from 'express';
import { moduleStore, setModuleEnabled, invalidateModules } from '../modules/index.js';
import { MODULE_DEFINITIONS } from '../modules/registry.js';
import { licenseStore, invalidateLicenses } from '../services/licensing/index.js';

export function createModuleHandlers({ moduleStore: ms, licenseStore: ls, setModuleEnabled: setEnabled, invalidateModules: invalidateM }) {
  async function list(req, res) {
    const [modules, licenses] = await Promise.all([ms.list(), ls.list()]);
    const licById = new Map(licenses.map(l => [l.id, l]));
    res.json({
      modules: modules.map(m => ({
        ...m,
        licensed: licById.get(m.id)?.licensed ?? false,
        licenseSource: licById.get(m.id)?.source ?? 'closed',
        licenseExpiresAt: licById.get(m.id)?.expiresAt ?? null,
      })),
    });
  }

  async function update(req, res) {
    const { id } = req.params;
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled boolean olmalı' });
    }
    if (!MODULE_DEFINITIONS.some(m => m.id === id)) {
      return res.status(400).json({ error: `Bilinmeyen modül: ${id}` });
    }
    await setEnabled(id, enabled, req.user?.id);
    return list(req, res); // güncel durumla yanıt — ekranda tek istek
  }

  async function refresh(req, res) {
    invalidateM();
    invalidateLicenses();
    return list(req, res);
  }

  return { list, update, refresh };
}

const handlers = createModuleHandlers({
  moduleStore,
  licenseStore,
  setModuleEnabled,
  invalidateModules,
});
const r = Router();
r.get('/', handlers.list);
r.patch('/:id', handlers.update);
r.post('/refresh', handlers.refresh);

export default r;
