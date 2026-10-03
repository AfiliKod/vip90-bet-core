import { Router } from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import { kycConfig } from '../config/kyc.js';
import { getIO } from '../services/socketEmitter.js';
import { sendEmail } from '../services/email.js';
import { errorLogger } from '../services/errorLogger.js';

const router = Router();

router.post('/webhook/sumsub', expressRawBody(), async (req, res) => {
  try {
    const signature = req.headers['x-app-signature'];
    const webhookSecret = await kycConfig.get('SUMSUB_WEBHOOK_SECRET');

    // SECURITY FIX (H5): Reject if webhook secret not configured
    if (!webhookSecret) {
      errorLogger.warn('sumsub_webhook', 'Webhook secret not configured — rejecting request');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    // SECURITY FIX (H4): Always require signature when secret is configured
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    const rawBody = req.rawBody;
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      errorLogger.warn('sumsub_webhook', 'Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // SECURITY FIX (H4): Timestamp validation — reject webhooks older than 5 minutes
    const timestamp = req.headers['x-app-timestamp'];
    if (!timestamp) {
      errorLogger.warn('sumsub_webhook', 'Webhook missing x-app-timestamp header');
      return res.status(401).json({ error: 'Missing timestamp header' });
    }
    const webhookTime = Number(timestamp);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - webhookTime) > 300) {
      errorLogger.warn('sumsub_webhook', `Webhook timestamp too old: ${timestamp}`);
      return res.status(401).json({ error: 'Webhook timestamp expired' });
    }

    const { type, payload } = req.body;
    if (!type) return res.status(200).json({ ok: true });

    if (type === 'applicantReviewed') {
      const reviewResult = payload?.reviewResult;
      const externalUserId = payload?.externalUserId;
      if (!externalUserId) return res.status(200).json({ ok: true });

      const user = await User.findById(externalUserId);
      if (!user) {
        errorLogger.warn('sumsub_webhook', `User not found: ${externalUserId}`);
        return res.status(200).json({ ok: true });
      }

      if (reviewResult?.reviewAnswer === 'GREEN') {
        user.kycStatus = 'approved';
        user.kycVerified = true;
        user.kycApprovedAt = new Date();
        user.kycRejectionReason = '';
        await user.save();

        await sendEmail({
          to: user.email,
          subject: 'KYC Onaylandi',
          html: `
            <h2>KYC Basvurunuz Onaylandi</h2>
            <p>Sayin ${user.username},</p>
            <p>Kimlik dogrulama isleminiz basariyla tamamlandi. Artik tum ozellikleri sinirsiz kullanabilirsiniz.</p>
            <p>Iyi eglenceler,<br>VIP90.bet Ekibi</p>
          `,
        });

        const io = getIO();
        if (io) io.to(`user:${user._id}`).emit('kyc:status', { status: 'approved' });
      } else if (reviewResult?.reviewAnswer === 'RED') {
        user.kycStatus = 'rejected';
        user.kycVerified = false;
        user.kycRejectedAt = new Date();
        user.kycRejectionReason = reviewResult?.moderComment || 'Sumsub tarafindan reddedildi';
        await user.save();

        await sendEmail({
          to: user.email,
          subject: 'KYC Reddedildi',
          html: `
            <h2>KYC Basvurunuz Reddedildi</h2>
            <p>Sayin ${user.username},</p>
            <p>Kimlik dogrulama isleminiz basarisiz oldu.</p>
            <p><strong>Sebep:</strong> ${user.kycRejectionReason}</p>
            <p>Lutfen dogru belgeleri yeniden yukleyin.</p>
            <p>Iyi eglenceler,<br>VIP90.bet Ekibi</p>
          `,
        });

        const io = getIO();
        if (io) io.to(`user:${user._id}`).emit('kyc:status', { status: 'rejected', reason: user.kycRejectionReason });
      }
    } else if (type === 'applicantPending') {
      const externalUserId = payload?.externalUserId;
      if (externalUserId) {
        const user = await User.findById(externalUserId);
        if (user) {
          user.kycStatus = 'pending';
          await user.save();
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    errorLogger.error('sumsub_webhook', `Webhook processing failed: ${e.message}`);
    res.status(200).json({ ok: true });
  }
});

function expressRawBody() {
  return (req, res, next) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      req.rawBody = data;
      try {
        req.body = JSON.parse(data);
      } catch {
        req.body = {};
      }
      next();
    });
  };
}

export default router;
