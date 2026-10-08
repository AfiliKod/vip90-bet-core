import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { requirePermission } from '../services/permissions.js';
import { validate } from '../middleware/validate.js';
import {
  createMailTemplateSchema,
  updateMailTemplateSchema,
  sendMailTemplateSchema,
  previewMailSchema,
} from '../validators/adminMailTemplates.js';
import * as ctrl from '../controllers/adminMailTemplates.js';

const r = Router();

// Statik yollar `/:id`'den ÖNCE tanımlanmalı — Express sırayla eşleştirir.
r.get('/', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.listMailTemplatesHandler);
r.get('/stats', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.mailTemplateStatsHandler);
r.get('/events', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.mailTemplateEventsHandler);
r.get('/logs', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.mailTemplateLogsHandler);
r.post('/preview', requireAuth, requireAdmin, requirePermission('admin:settings:read'), validate(previewMailSchema), ctrl.previewMailHandler);

r.post('/', requireAuth, requireAdmin, requirePermission('admin:settings:write'), validate(createMailTemplateSchema), ctrl.createMailTemplateHandler);
r.get('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:read'), ctrl.getMailTemplateHandler);
r.patch('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), validate(updateMailTemplateSchema), ctrl.updateMailTemplateHandler);
r.delete('/:id', requireAuth, requireAdmin, requirePermission('admin:settings:write'), ctrl.deleteMailTemplateHandler);
r.post('/:id/send', requireAuth, requireAdmin, requirePermission('admin:settings:write'), validate(sendMailTemplateSchema), ctrl.sendMailTemplateHandler);

export default r;
