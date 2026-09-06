import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserKycStatus } from '../services/kyc.js';
import { kycConfig } from '../config/kyc.js';
import { createApplicant, generateSDKToken } from '../services/sumsubService.js';
import { createError } from '../middleware/error.js';
import User from '../models/User.js';

const r = Router();

r.get('/status', requireAuth, async (req, res, next) => {
  try {
    const status = await getUserKycStatus(req.user.id);
    const provider = await kycConfig.get('KYC_PROVIDER');
    res.json({ ...status, provider });
  } catch (e) { next(e); }
});

r.post('/init-session', requireAuth, async (req, res, next) => {
  try {
    const provider = await kycConfig.get('KYC_PROVIDER');
    if (provider !== 'sumsub') {
      throw createError(400, 'PROVIDER_NOT_SUMSUB', 'KYC provider Sumsub olarak ayarli degil');
    }

    const enabled = await kycConfig.get('KYC_ENABLED');
    if (enabled !== 'true' && enabled !== true) {
      throw createError(400, 'KYC_DISABLED', 'KYC su an devre disi');
    }

    const user = await User.findById(req.user.id);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanici bulunamadi');

    if (user.kycStatus === 'approved') {
      throw createError(400, 'ALREADY_APPROVED', 'KYC zaten onaylanmis');
    }

    let applicantId = user.sumsubApplicantId;
    if (!applicantId) {
      const result = await createApplicant(user._id, user.email, {
        country: req.body?.country,
      });
      applicantId = result.data?.id;
      if (!applicantId) throw createError(500, 'SUMSUB_ERROR', 'Applicant olusturulamadi');
      user.sumsubApplicantId = applicantId;
    }

    user.kycStatus = 'pending';
    user.kycSubmittedAt = new Date();
    user.kycProvider = 'sumsub';
    await user.save();

    const levelName = await kycConfig.get('SUMSUB_LEVEL_NAME') || 'basic-kyc-level';
    const tokenResult = await generateSDKToken(applicantId, levelName);
    const sdkToken = tokenResult.data?.token;
    if (!sdkToken) throw createError(500, 'SUMSUB_ERROR', 'SDK token alinamadi');

    res.json({ token: sdkToken, applicantId });
  } catch (e) { next(e); }
});

export default r;
