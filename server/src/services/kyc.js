import KycDocument from '../models/KycDocument.js';
import User from '../models/User.js';
import { getIO } from './socketEmitter.js';
import { sendEmail } from './email.js';

/**
 * KYC configuration - which pages/features require KYC
 */
export const KYC_REQUIREMENTS = {
  withdrawal: { required: true, minAmount: 100 },
  high_stakes_bet: { required: true, minAmount: 1000 },
  casino_access: { required: false },
  agent_transfer: { required: true },
  profile_change: { required: false },
};

/**
 * Submit KYC documents for a user
 */
export async function submitKycDocuments(userId, documents, options = {}) {
  const { session = null } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  // Check if already has pending/under_review KYC
  const existingDocs = await KycDocument.find({
    userId,
    status: { $in: ['pending', 'under_review'] },
  }).session(session);

  if (existingDocs.length > 0) {
    throw new Error('KYC submission already in progress');
  }

  // Create document records
  const kycDocs = await KycDocument.insertMany(
    documents.map(doc => ({
      userId,
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      mimeType: doc.mimeType,
      fileUrl: doc.fileUrl,
      status: 'pending',
      metadata: doc.metadata || {},
    })),
    { session }
  );

  // Update user KYC status
  user.kycStatus = 'pending';
  user.kycSubmittedAt = new Date();
  user.kycRejectionReason = '';
  await user.save({ session });

  // Notify admins
  notifyAdminsNewKycSubmission(userId, kycDocs.length);

  return kycDocs;
}

/**
 * Get user's KYC status and documents
 */
export async function getUserKycStatus(userId) {
  const user = await User.findById(userId)
    .select('kycStatus kycSubmittedAt kycApprovedAt kycRejectedAt kycRejectionReason kycRequiredFor kycVerified');

  if (!user) return null;

  const documents = await KycDocument.find({ userId })
    .sort({ createdAt: -1 })
    .select('documentType fileName fileSize mimeType fileUrl status reviewedBy reviewedAt rejectionReason createdAt');

  return {
    userId: user._id,
    kycStatus: user.kycStatus,
    kycVerified: user.kycVerified,
    kycSubmittedAt: user.kycSubmittedAt,
    kycApprovedAt: user.kycApprovedAt,
    kycRejectedAt: user.kycRejectedAt,
    kycRejectionReason: user.kycRejectionReason,
    kycRequiredFor: user.kycRequiredFor || [],
    documents,
  };
}

/**
 * Admin approve KYC
 */
export async function approveKyc(userId, adminId, options = {}) {
  const { session = null, notes = '' } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  if (user.kycStatus === 'approved') {
    throw new Error('KYC already approved');
  }

  // Update all pending/under_review documents to approved
  await KycDocument.updateMany(
    { userId, status: { $in: ['pending', 'under_review'] } },
    { 
      status: 'approved', 
      reviewedBy: adminId, 
      reviewedAt: new Date(),
      $set: { 'metadata.adminNotes': notes }
    },
    { session }
  );

  // Update user
  user.kycStatus = 'approved';
  user.kycVerified = true;
  user.kycApprovedAt = new Date();
  user.kycRejectionReason = '';
  await user.save({ session });

  // Send email notification
  await sendEmail({
    to: user.email,
    subject: 'KYC Onaylandı',
    html: `
      <h2>KYC Başvurunuz Onaylandı</h2>
      <p>Sayın ${user.username},</p>
      <p>Kimlik doğrulama belgeleriniz incelendi ve onaylandı. Artık tüm özellikleri sınırsız kullanabilirsiniz.</p>
      ${notes ? `<p><strong>Admin notu:</strong> ${notes}</p>` : ''}
      <p>İyi eğlenceler,<br>VIP90.bet Ekibi</p>
    `,
  });

  // Real-time update
  const io = getIO();
  if (io) io.to(`user:${userId}`).emit('kyc:status', { status: 'approved' });

  return user;
}

/**
 * Admin reject KYC
 */
export async function rejectKyc(userId, adminId, reason, options = {}) {
  const { session = null } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  // Update all pending/under_review documents to rejected
  await KycDocument.updateMany(
    { userId, status: { $in: ['pending', 'under_review'] } },
    { 
      status: 'rejected', 
      reviewedBy: adminId, 
      reviewedAt: new Date(),
      rejectionReason: reason,
    },
    { session }
  );

  // Update user
  user.kycStatus = 'rejected';
  user.kycVerified = false;
  user.kycRejectedAt = new Date();
  user.kycRejectionReason = reason;
  await user.save({ session });

  // Send email notification
  await sendEmail({
    to: user.email,
    subject: 'KYC Reddedildi',
    html: `
      <h2>KYC Başvurunuz Reddedildi</h2>
      <p>Sayın ${user.username},</p>
      <p>Kimlik doğrulama belgeleriniz incelendi ancak reddedildi.</p>
      <p><strong>Sebep:</strong> ${reason}</p>
      <p>Lütfen doğru belgeleri yeniden yükleyin.</p>
      <p>İyi eğlenceler,<br>VIP90.bet Ekibi</p>
    `,
  });

  // Real-time update
  const io = getIO();
  if (io) io.to(`user:${userId}`).emit('kyc:status', { status: 'rejected', reason });

  return user;
}

/**
 * Admin set KYC to under_review
 */
export async function setKycUnderReview(userId, adminId, options = {}) {
  const { session = null } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  await KycDocument.updateMany(
    { userId, status: 'pending' },
    { status: 'under_review', reviewedBy: adminId },
    { session }
  );

  user.kycStatus = 'under_review';
  await user.save({ session });

  const io = getIO();
  if (io) io.to(`user:${userId}`).emit('kyc:status', { status: 'under_review' });

  return user;
}

/**
 * Check if user needs KYC for a specific action
 */
export async function checkKycRequired(userId, action, amount = 0) {
  const user = await User.findById(userId).select('kycStatus kycRequiredFor kycVerified');
  if (!user) throw new Error('User not found');

  // Already verified
  if (user.kycVerified && user.kycStatus === 'approved') {
    return { required: false };
  }

  // Check if user has custom requirement for this action (overrides config)
  if (user.kycRequiredFor && user.kycRequiredFor.includes(action)) {
    return { 
      required: true, 
      currentStatus: user.kycStatus,
      message: `${action} işlemi için KYC doğrulaması gerekiyor` 
    };
  }

  // Check specific action requirement from config
  const requirement = KYC_REQUIREMENTS[action];
  if (!requirement || !requirement.required) {
    return { required: false };
  }

  // Check amount threshold
  if (requirement.minAmount && amount < requirement.minAmount) {
    return { required: false };
  }

  // KYC required for this action type
  return { 
    required: true, 
    currentStatus: user.kycStatus,
    message: `${action} işlemi için KYC doğrulaması gerekiyor` 
  };
}

/**
 * Middleware to enforce KYC on routes
 */
export function requireKyc(action, getAmount = (req) => 0) {
  return async (req, res, next) => {
    if (!req.user) {
      return next({ status: 401, code: 'UNAUTHORIZED', message: 'Token gerekli' });
    }

    const amount = getAmount(req);
    const check = await checkKycRequired(req.user.id, action, amount);

    if (check.required) {
      return next({ 
        status: 403, 
        code: 'KYC_REQUIRED', 
        message: check.message,
        kycStatus: check.currentStatus,
      });
    }

    next();
  };
}

/**
 * Get all KYC submissions (admin)
 */
export async function getAllKycSubmissions(options = {}) {
  const { status, page = 1, limit = 20, search = '' } = options;
  const skip = (Number(page) - 1) * Number(limit);

  const filter = {};
  if (status) filter['user.kycStatus'] = status;
  if (search) {
    filter.$or = [
      { 'user.username': { $regex: search, $options: 'i' } },
      { 'user.email': { $regex: search, $options: 'i' } },
    ];
  }

  const [submissions, total] = await Promise.all([
    User.find(filter)
      .select('username email kycStatus kycSubmittedAt kycApprovedAt kycRejectedAt kycRejectionReason kycVerified')
      .sort({ kycSubmittedAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  // Get document counts for each user
  const userIds = submissions.map(u => u._id);
  const docCounts = await KycDocument.aggregate([
    { $match: { userId: { $in: userIds } } },
    { $group: { _id: '$userId', pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }, rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } } } },
  ]);

  const docCountMap = Object.fromEntries(docCounts.map(d => [d._id.toString(), d]));

  const submissionsWithCounts = submissions.map(user => ({
    ...user.toObject(),
    docCounts: docCountMap[user._id.toString()] || { pending: 0, approved: 0, rejected: 0 },
  }));

  return { submissions: submissionsWithCounts, total, page: Number(page), pages: Math.ceil(total / Number(limit)) };
}

/**
 * Get KYC stats (admin)
 */
export async function getKycStats() {
  const [byStatus, recentSubmissions, approvedToday] = await Promise.all([
    User.aggregate([
      { $group: { _id: '$kycStatus', count: { $sum: 1 } } },
    ]),
    User.find({ kycSubmittedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
      .select('username email kycStatus kycSubmittedAt')
      .sort({ kycSubmittedAt: -1 })
      .limit(10),
    User.countDocuments({
      kycStatus: 'approved',
      kycApprovedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  return {
    byStatus,
    recentSubmissions,
    approvedToday,
  };
}

/**
 * Add KYC requirement for a user (admin)
 */
export async function addKycRequirement(userId, requirement, options = {}) {
  const { session = null } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  const requirements = user.kycRequiredFor || [];
  if (!requirements.includes(requirement)) {
    requirements.push(requirement);
    user.kycRequiredFor = requirements;
    await user.save({ session });
  }

  return user;
}

/**
 * Remove KYC requirement for a user (admin)
 */
export async function removeKycRequirement(userId, requirement, options = {}) {
  const { session = null } = options;

  const user = await User.findById(userId).session(session);
  if (!user) throw new Error('User not found');

  user.kycRequiredFor = (user.kycRequiredFor || []).filter(r => r !== requirement);
  await user.save({ session });

  return user;
}

/**
 * Expire old KYC (cron job)
 */
export async function expireOldKyc() {
  const users = await User.find({
    kycStatus: 'approved',
    kycApprovedAt: { $lt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) }, // 1 year
  });

  for (const user of users) {
    user.kycStatus = 'expired';
    user.kycVerified = false;
    await user.save();

    const io = getIO();
    if (io) io.to(`user:${user._id}`).emit('kyc:status', { status: 'expired' });
  }

  return users.length;
}

/**
 * Notify admins of new KYC submission
 */
async function notifyAdminsNewKycSubmission(userId, docCount) {
  // Would integrate with admin notification system
  const io = getIO();
  if (io) {
    io.to('role:admin').emit('kyc:new_submission', { userId, docCount });
  }
}