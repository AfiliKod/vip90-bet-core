import { Router } from 'express';
import { serveManifest } from '../controllers/manifestController.js';

const router = Router();
router.get('/manifest.webmanifest', serveManifest);
router.get('/site.webmanifest', serveManifest);
export default router;
