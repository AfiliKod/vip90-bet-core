import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditLog } from '../middleware/audit.js';
import { createJobSchema, resolveItemSchema } from '../validators/reconciliation.js';
import * as ctrl from '../controllers/reconciliation.js';

const r = Router();
r.use(requireAuth, requireAdmin);

// List reconciliation jobs
r.get('/jobs', ctrl.listJobs);

// Create a new reconciliation job
r.post('/jobs', auditLog('RECONCILIATION_JOB_CREATE'), validate(createJobSchema), ctrl.createJob);

// Get reconciliation job by ID
r.get('/jobs/:id', ctrl.getJob);

// Start a reconciliation job
r.post('/jobs/:id/start', auditLog('RECONCILIATION_JOB_START'), ctrl.startJob);

// Get reconciliation items for a job
r.get('/jobs/:id/items', ctrl.getJobItems);

// Resolve a reconciliation item
r.post('/items/:itemId/resolve', auditLog('RECONCILIATION_ITEM_RESOLVE'), validate(resolveItemSchema), ctrl.resolveItem);

// Get reconciliation statistics
r.get('/stats', ctrl.getStats);

export default r;
