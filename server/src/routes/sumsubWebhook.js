import { Router } from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { kycConfig } from '../config/kyc.js';
import { getTenancyMode } from '../config/tenancy.js';
import { getDefaultTenantId } from '../tenancy/defaultTenantId.js';
import { runWithTenant } from '../tenancy/context.js';
import { getIO } from '../services/socketEmitter.js';
import { sendActionMail } from '../services/systemMail.js';
import { errorLogger } from '../services/errorLogger.js';

const router = Router();

/**
 * Resolve the webhook tenant from the URL before the body is parsed (spec §8.4).
 * Multi mode requires the `/webhook/sumsub/:tenantId` segment; single mode keeps
 * the legacy parameter-less URL, which targets the default tenant.
 * @param {string|undefined} rawTenant
 * @returns {Promise<{ tenantId?: unknown, scoped?: boolean, error?: [number, string] }>}
 */
async function resolveWebhookTenant(rawTenant) {
  if (!rawTenant) {
    if (getTenancyMode() === 'multi') return { error: [400, 'TENANT_REQUIRED'] };
    // Legacy URL: keep the ambient/default-tenant scope exactly as before.
    return { tenantId: getDefaultTenantId(), scoped: false };
  }
  const filter = mongoose.isObjectIdOrHexString(rawTenant)
    ? { _id: rawTenant }
    : { key: String(rawTenant).trim().toLowerCase() };
  const tenant = await Tenant.findOne({ ...filter, status: { $ne: 'closed' } }).select('_id').lean();
  if (!tenant) return { error: [404, 'TENANT_NOT_FOUND'] };
  return { tenantId: tenant._id, scoped: true };
}

async function applyApplicantReviewed(user, reviewResult) {
  if (reviewResult?.reviewAnswer === 'GREEN') {
    user.kycStatus = 'approved';
    user.kycVerified = true;
    user.kycApprovedAt = new Date();
    user.kycRejectionReason = '';
    await user.save();

    await sendActionMail('kyc.approved', {
      user,
      vars: { note: '' },
      fallback: async () => ({
        subject: 'KYC Onaylandi',
        html: `
        <h2>KYC Basvurunuz Onaylandi</h2>
        <p>Sayin ${user.username},</p>
        <p>Kimlik dogrulama isleminiz basariyla tamamlandi. Artik tum ozellikleri sinirsiz kullanabilirsiniz.</p>
        <p>Iyi eglenceler,<br>VIP90.bet Ekibi</p>
      `,
      }),
    });

    const io = getIO();
    if (io) io.to(`user:${user._id}`).emit('kyc:status', { status: 'approved' });
  } else if (reviewResult?.reviewAnswer === 'RED') {
    user.kycStatus = 'rejected';
    user.kycVerified = false;
    user.kycRejectedAt = new Date();
    user.kycRejectionReason = reviewResult?.moderComment || 'Sumsub tarafindan reddedildi';
    await user.save();

    await sendActionMail('kyc.rejected', {
      user,
      vars: { note: user.kycRejectionReason || '' },
      fallback: async () => ({
        subject: 'KYC Reddedildi',
        html: `
        <h2>KYC Basvurunuz Reddedildi</h2>
        <p>Sayin ${user.username},</p>
        <p>Kimlik dogrulama isleminiz basarisiz oldu.</p>
        <p><strong>Sebep:</strong> ${user.kycRejectionReason}</p>
        <p>Lutfen dogru belgeleri yeniden yukleyin.</p>
        <p>Iyi eglenceler,<br>VIP90.bet Ekibi</p>
      `,
      }),
    });

    const io = getIO();
    if (io) io.to(`user:${user._id}`).emit('kyc:status', { status: 'rejected', reason: user.kycRejectionReason });
  }
}

async function applyApplicantPending(user) {
  user.kycStatus = 'pending';
  await user.save();
}

router.post(['/webhook/sumsub/:tenantId', '/webhook/sumsub'], async (req, res) => {
  try {
    const { tenantId, scoped, error } = await resolveWebhookTenant(req.params?.tenantId);
    if (error) return res.status(error[0]).json({ error: error[1] });

    const signature = req.headers['x-app-signature'];
    let webhookSecret;
    try {
      // Tenant secret is selected before the body is parsed (spec §8.4); in
      // multi mode this never falls back to another tenant or to env.
      webhookSecret = scoped
        ? await kycConfig.get('SUMSUB_WEBHOOK_SECRET', { tenantId })
        : await kycConfig.get('SUMSUB_WEBHOOK_SECRET');
    } catch {
      // Anahtar yok/yanlış: 503 dön ki Sumsub yeniden denesin (200 olay kaybettirir).
      errorLogger.error('sumsub_webhook', 'webhook secret unreadable');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    // SECURITY FIX (H5): Reject if webhook secret not configured
    if (!webhookSecret) {
      errorLogger.warn('sumsub_webhook', 'Webhook secret not configured — rejecting request');
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    // SECURITY FIX (H4): Always require signature when secret is configured
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Ham gövde app.js'te express.json verify kancasıyla yakalanır (V11).
    const rawBody = req.rawBody ?? '';
    if (!rawBody) {
      return res.status(401).json({ error: 'Missing body' });
    }
    const expectedSig = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    // timingSafeEqual uzunluk farkında fırlatır; catch 200 döneceği için önce kontrol et.
    if (typeof signature !== 'string' || signature.length !== expectedSig.length) {
      errorLogger.warn('sumsub_webhook', 'Invalid webhook signature length');
      return res.status(401).json({ error: 'Invalid signature' });
    }
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

    const externalUserId = payload?.externalUserId;
    if (!externalUserId) return res.status(200).json({ ok: true });
    if (type !== 'applicantReviewed' && type !== 'applicantPending') {
      return res.status(200).json({ ok: true });
    }

    // A player of another tenant answers like a missing id (spec §8.4): never 403,
    // never the record. Single mode keeps its historical 200 acknowledgement.
    const userNotFound = () => {
      errorLogger.warn('sumsub_webhook', `User not found: ${externalUserId}`);
      if (scoped || getTenancyMode() === 'multi') {
        return res.status(404).json({ error: 'USER_NOT_FOUND' });
      }
      return res.status(200).json({ ok: true });
    };

    if (!mongoose.isObjectIdOrHexString(externalUserId)) return userNotFound();

    const applyEvent = async (user) => {
      if (type === 'applicantReviewed') await applyApplicantReviewed(user, payload?.reviewResult);
      else await applyApplicantPending(user);
    };

    if (!scoped) {
      const user = await User.findById(externalUserId);
      if (!user) return userNotFound();
      await applyEvent(user);
      return res.status(200).json({ ok: true });
    }

    const handled = await runWithTenant(tenantId, async () => {
      const user = await User.findOne({ _id: externalUserId, tenantId });
      if (!user) return false;
      await applyEvent(user);
      return true;
    });
    if (!handled) return userNotFound();

    res.status(200).json({ ok: true });
  } catch (e) {
    errorLogger.error('sumsub_webhook', `Webhook processing failed: ${e.message}`);
    res.status(200).json({ ok: true });
  }
});

export default router;
