import { Router } from 'express';
import { getFeaturedGameCodes } from '../games/index.js';

const r = Router();

/** Herkese açık — CasinoRedesign.jsx 'featured' kategorisi buradan kod listesini çeker. */
r.get('/featured', async (req, res, next) => {
  try {
    const codes = await getFeaturedGameCodes();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ codes });
  } catch (e) { next(e); }
});

export default r;
