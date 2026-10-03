/**
 * Slikair Payment Gateway Routes
 *
 * Kullanıcı yatırma + webhook + kendi ödeme geçmişi endpoint'leri.
 * Admin endpoint'leri admin.js router'ına eklenir.
 *
 * Modül gate'i (`slikair-payment`) yalnızca oyuncunun yeni yatırma BAŞLATMASINI
 * keser. Webhook'lar BİLEREK gate'siz: modül kapatılsa bile Slikair'in daha önce
 * başlatılmış ödemeler için gönderdiği bildirimler işlenmeli, gelen ödeme kaybolmamalı.
 * Kendi ödeme geçmişi (salt okunur) da açık kalır.
 */
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createModuleGate } from '../middleware/moduleGate.js';
import { isModuleUsable } from '../services/licensing/index.js';
import { slikairDepositSchema } from '../validators/slikair.js';
import * as slikairController from '../controllers/slikairController.js';

export function createSlikairRouter({
  isUsable = isModuleUsable,
  ctrl = slikairController,
  auth = requireAuth,
} = {}) {
  const r = Router();
  const requireSlikairPayment = createModuleGate({ isUsable, moduleId: 'slikair-payment' });

  // Kullanıcı yatırma başlat
  r.post('/deposit', requireSlikairPayment, auth, validate(slikairDepositSchema), ctrl.initiateDeposit);

  // Kullanıcı kendi ödeme geçmişi
  r.get('/my-payments', auth, ctrl.getMyPayments);

  // Webhook: Slikair → Biz (auth yok, gate yok — bkz. dosya başlığı)
  r.post('/webhook/payin', ctrl.handlePayinWebhook);
  r.post('/webhook/payout', ctrl.handlePayoutWebhook);

  return r;
}

export default createSlikairRouter();
