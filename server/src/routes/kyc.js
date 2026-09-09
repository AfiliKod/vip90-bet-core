import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getUserKycStatus, submitKycDocuments } from '../services/kyc.js';
import { kycConfig } from '../config/kyc.js';
import { createApplicant, generateSDKToken } from '../services/sumsubService.js';
import { createError } from '../middleware/error.js';
import { uploadKycDocs } from '../middleware/upload.js';
import User from '../models/User.js';

const r = Router();

// ─── KYC Durumu (her iki provider için ortak) ──────────────────────
r.get('/status', requireAuth, async (req, res, next) => {
  try {
    const status = await getUserKycStatus(req.user.id);
    const provider = await kycConfig.get('KYC_PROVIDER');
    const enabled = await kycConfig.get('KYC_ENABLED');
    res.json({ ...status, provider, enabled: enabled === 'true' || enabled === true });
  } catch (e) { next(e); }
});

// ─── Sumsub Oturum Başlatma (sadece Sumsub provider) ───────────────
r.post('/init-session', requireAuth, async (req, res, next) => {
  try {
    const provider = await kycConfig.get('KYC_PROVIDER');
    if (provider !== 'sumsub') {
      throw createError(400, 'PROVIDER_NOT_SUMSUB', 'KYC provider Sumsub olarak ayarlı değil');
    }

    const enabled = await kycConfig.get('KYC_ENABLED');
    if (enabled !== 'true' && enabled !== true) {
      throw createError(400, 'KYC_DISABLED', 'KYC şu an devre dışı');
    }

    const user = await User.findById(req.user.id);
    if (!user) throw createError(404, 'NOT_FOUND', 'Kullanıcı bulunamadı');

    if (user.kycStatus === 'approved') {
      throw createError(400, 'ALREADY_APPROVED', 'KYC zaten onaylanmış');
    }

    let applicantId = user.sumsubApplicantId;
    if (!applicantId) {
      const result = await createApplicant(user._id, user.email, {
        country: req.body?.country,
      });
      applicantId = result.data?.id;
      if (!applicantId) throw createError(500, 'SUMSUB_ERROR', 'Applicant oluşturulamadı');
      user.sumsubApplicantId = applicantId;
    }

    user.kycStatus = 'pending';
    user.kycSubmittedAt = new Date();
    user.kycProvider = 'sumsub';
    await user.save();

    const levelName = await kycConfig.get('SUMSUB_LEVEL_NAME') || 'basic-kyc-level';
    const tokenResult = await generateSDKToken(applicantId, levelName);
    const sdkToken = tokenResult.data?.token;
    if (!sdkToken) throw createError(500, 'SUMSUB_ERROR', 'SDK token alınamadı');

    res.json({ token: sdkToken, applicantId });
  } catch (e) { next(e); }
});

// ─── Lokal Belge Yükleme (sadece manuel provider) ──────────────────
r.post('/documents', requireAuth, uploadKycDocs.array('documents', 6), async (req, res, next) => {
  try {
    const provider = await kycConfig.get('KYC_PROVIDER');
    if (provider !== 'manual') {
      throw createError(400, 'PROVIDER_NOT_MANUAL', 'KYC provider manuel olarak ayarlı değil');
    }

    const enabled = await kycConfig.get('KYC_ENABLED');
    if (enabled !== 'true' && enabled !== true) {
      throw createError(400, 'KYC_DISABLED', 'KYC şu an devre dışı');
    }

    if (!req.files || req.files.length === 0) {
      throw createError(400, 'NO_FILES', 'En az bir belge yükleyin');
    }

    const documents = req.files.map(file => ({
      documentType: req.body.documentType || 'identity_card',
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      fileUrl: `/uploads/kyc/${file.filename}`,
      metadata: {
        country: req.body.country,
        documentNumber: req.body.documentNumber,
      },
    }));

    const kycDocs = await submitKycDocuments(req.user.id, documents);

    // Provider'ı manuel olarak ayarla
    await User.findByIdAndUpdate(req.user.id, { kycProvider: 'manual' });

    res.json({ documents: kycDocs, count: kycDocs.length });
  } catch (e) { next(e); }
});

export default r;
