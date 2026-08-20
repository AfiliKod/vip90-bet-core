import { Router } from 'express';
import { getHomeContent } from '../pages/index.js';

const r = Router();

/** Herkese açık — HomePage.jsx bölüm sırası + banner override'larını buradan çeker. */
r.get('/home', async (req, res, next) => {
  try {
    const content = await getHomeContent();
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ content });
  } catch (e) { next(e); }
});

export default r;
