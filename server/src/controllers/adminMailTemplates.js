import {
  listTemplates,
  getTemplateById as getTemplateByIdService,
  createTemplate,
  updateTemplate as updateTemplateService,
  deleteTemplate as deleteTemplateService,
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
import { createError } from '../middleware/error.js';

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

/** GET /api/admin/mail-templates/:id — tenant-scoped (İP-5, §9 G-3) */
export async function getTemplateById(req, res, next) {
  try {
    const doc = await getTemplateByIdService(req.params.id, { tenantId: req.tenant?.id ?? null });
    if (!doc) throw createError(404, 'NOT_FOUND', 'Şablon bulunamadı');
    res.json({ template: doc, sampleVars: buildSampleVars(doc.event) });
  } catch (e) {
    next(e);
  }
}

export const getMailTemplateHandler = getTemplateById;

/** POST /api/admin/mail-templates */
export async function createMailTemplateHandler(req, res, next) {
  try {
    const doc = await createTemplate(req.validated, req.user?.id || null);
    res.status(201).json({ template: doc });
  } catch (e) {
    next(e);
  }
}

/** PATCH /api/admin/mail-templates/:id — tenant-scoped (İP-5, §9 G-3) */
export async function updateTemplate(req, res, next) {
  try {
    const doc = await updateTemplateService(req.params.id, req.validated, req.user?.id || null, { tenantId: req.tenant?.id ?? null });
    if (!doc) throw createError(404, 'NOT_FOUND', 'Şablon bulunamadı');
    res.json({ template: doc });
  } catch (e) {
    next(e);
  }
}

export const updateMailTemplateHandler = updateTemplate;

/** DELETE /api/admin/mail-templates/:id — tenant-scoped (İP-5, §9 G-3) */
export async function deleteTemplate(req, res, next) {
  try {
    const result = await deleteTemplateService(req.params.id, { tenantId: req.tenant?.id ?? null });
    if (!result) throw createError(404, 'NOT_FOUND', 'Şablon bulunamadı');
    res.json({ deleted: true, ...result });
  } catch (e) {
    next(e);
  }
}

export const deleteMailTemplateHandler = deleteTemplate;

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
      tenantId: req.tenant?.id ?? null,
    });
    invalidateMailTemplateCache();
    res.json(result);
  } catch (e) {
    next(e);
  }
}
