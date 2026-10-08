import {
  listTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateStats,
  listLogs,
  listEvents,
  buildSampleVars,
  renderTemplateDocument,
  invalidateMailTemplateCache,
} from '../services/mailTemplates.js';
import { sendBulk } from '../services/systemMail.js';
import { getSiteName } from '../branding/index.js';
import { localeStore } from '../services/localeLive.js';

async function lang() {
  try {
    return await localeStore.get();
  } catch {
    return 'tr';
  }
}

/** GET /api/admin/mail-templates */
export async function listMailTemplatesHandler(req, res, next) {
  try {
    const { page, limit, search, category, enabled } = req.query;
    const result = await listTemplates({
      page,
      limit,
      search,
      category,
      enabled: enabled === undefined ? null : enabled === 'true',
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/** GET /api/admin/mail-templates/stats */
export async function mailTemplateStatsHandler(req, res, next) {
  try {
    res.json(await getTemplateStats());
  } catch (e) {
    next(e);
  }
}

/** GET /api/admin/mail-templates/events — yeni şablon için olay kataloğu */
export async function mailTemplateEventsHandler(req, res, next) {
  try {
    res.json({ events: await listEvents() });
  } catch (e) {
    next(e);
  }
}

/** GET /api/admin/mail-templates/logs — gönderim geçmişi */
export async function mailTemplateLogsHandler(req, res, next) {
  try {
    const { page, limit, templateId, status } = req.query;
    res.json(await listLogs({ page, limit, templateId, status }));
  } catch (e) {
    next(e);
  }
}

/** POST /api/admin/mail-templates/preview — render önizlemesi (kaydetmez) */
export async function previewMailHandler(req, res, next) {
  try {
    const p = req.validated;
    const vars = { ...buildSampleVars(p.event), ...(p.vars || {}) };
    const siteName = await getSiteName();
    const { subject, html } = renderTemplateDocument(
      { subject: p.subject, preheader: p.preheader, body: p.body, ctaLabel: p.ctaLabel, ctaUrl: p.ctaUrl },
      vars,
      { siteName, lang: await lang() },
    );
    res.json({ subject, html, vars });
  } catch (e) {
    next(e);
  }
}

/** GET /api/admin/mail-templates/:id */
export async function getMailTemplateHandler(req, res, next) {
  try {
    const doc = await getTemplateById(req.params.id);
    if (!doc) return res.status(404).json({ error: { code: 'MAIL_NOT_FOUND', message: 'Şablon bulunamadı' } });
    res.json({ template: doc, sampleVars: buildSampleVars(doc.event) });
  } catch (e) {
    next(e);
  }
}

/** POST /api/admin/mail-templates */
export async function createMailTemplateHandler(req, res, next) {
  try {
    const doc = await createTemplate(req.validated, req.user?.id || null);
    res.status(201).json({ template: doc });
  } catch (e) {
    next(e);
  }
}

/** PATCH /api/admin/mail-templates/:id */
export async function updateMailTemplateHandler(req, res, next) {
  try {
    const doc = await updateTemplate(req.params.id, req.validated, req.user?.id || null);
    if (!doc) return res.status(404).json({ error: { code: 'MAIL_NOT_FOUND', message: 'Şablon bulunamadı' } });
    res.json({ template: doc });
  } catch (e) {
    next(e);
  }
}

/** DELETE /api/admin/mail-templates/:id */
export async function deleteMailTemplateHandler(req, res, next) {
  try {
    const result = await deleteTemplate(req.params.id);
    if (!result) return res.status(404).json({ error: { code: 'MAIL_NOT_FOUND', message: 'Şablon bulunamadı' } });
    res.json({ deleted: true, ...result });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/admin/mail-templates/:id/send
 * Yalnızca `scheduled` kategori — aksiyona bağlı şablonlar elle gönderilemez
 * (servis 400 `MAIL_ACTION_TRIGGER_ONLY` döner).
 */
export async function sendMailTemplateHandler(req, res, next) {
  try {
    const result = await sendBulk(req.params.id, {
      audience: req.validated.audience || null,
      triggeredBy: req.user?.id || null,
      trigger: 'manual',
    });
    invalidateMailTemplateCache();
    res.json(result);
  } catch (e) {
    next(e);
  }
}
