import { Router } from 'express';
import { createError } from '../middleware/error.js';
import { requireStaff, requireStaffPermission } from '../middleware/auth.js';
import { listGrants, issueGrant, revokeGrant } from '../controllers/partnerGrantsController.js';

const router = Router();
router.use(requireStaff('tenant'));
// Grants are issued by the tenant's own staff; a partner never grants itself.
router.use((req, res, next) => (req.staff?.scope === 'partner'
  ? next(createError(403, 'FORBIDDEN', 'Partner personeli partner izni yönetemez'))
  : next()));

router.get('/', requireStaffPermission('admin:partner-grants:read'), listGrants);
router.post('/', requireStaffPermission('admin:partner-grants:write'), issueGrant);
router.delete('/:id', requireStaffPermission('admin:partner-grants:write'), revokeGrant);

export default router;
