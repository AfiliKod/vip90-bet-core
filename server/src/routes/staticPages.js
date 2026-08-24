import { Router } from 'express';
import { getPublicPageList, getPublicPage } from '../services/staticPages.js';

const r = Router();

/** Herkese açık — Footer.jsx bu listeden marka/destek/yasal kolonlarını üretir. */
r.get('/', async (req, res, next) => {
  try {
    const pages = await getPublicPageList();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ pages });
  } catch (e) { next(e); }
});

r.get('/:slug', async (req, res, next) => {
  try {
    const page = await getPublicPage(req.params.slug);
    if (!page) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Sayfa bulunamadı veya kapalı' } });
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ page });
  } catch (e) { next(e); }
});

export default r;
