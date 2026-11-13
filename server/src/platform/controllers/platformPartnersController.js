import mongoose from 'mongoose';
import Partner from '../../models/Partner.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import { createError } from '../../middleware/error.js';
import { writePlatformLevelAudit } from '../services/platformAudit.js';
import { assertValidCommercialTerms } from '../services/commercialTerms.js';

function validId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

function mergedSubdoc(existing, patch) {
  const base = typeof existing?.toObject === 'function' ? existing.toObject() : (existing || {});
  return { ...base, ...patch };
}

export async function listPartners(req, res, next) {
  try {
    const partners = await Partner.find().sort({ createdAt: -1 }).lean();
    const partnerIds = partners.map((p) => p._id);
    const links = await PartnerOperatorLink.find({ partnerId: { $in: partnerIds }, validTo: null }).lean();
    const countMap = {};
    for (const link of links) {
      countMap[String(link.partnerId)] = (countMap[String(link.partnerId)] || 0) + 1;
    }
    const result = partners.map((p) => ({
      ...p,
      activeTenantsCount: countMap[String(p._id)] || 0,
    }));
    res.json({ partners: result });
  } catch (err) {
    next(err);
  }
}

export async function createPartner(req, res, next) {
  try {
    const { key, name, legalEntity, contact, capabilities, provisioningLimits, defaultCommercialTerms } = req.body;
    if (!key || !name) throw createError(400, 'KEY_AND_NAME_REQUIRED', 'Partner key and name are required');

    const validTerms = defaultCommercialTerms ? await assertValidCommercialTerms(defaultCommercialTerms) : undefined;
    const partner = await Partner.create({
      key,
      name,
      legalEntity,
      contact,
      capabilities,
      provisioningLimits,
      defaultCommercialTerms: validTerms,
      createdBy: req.staff.id,
    });
    await writePlatformLevelAudit(req, 'PARTNER_CREATED', {
      targetId: partner._id,
      metadata: { key: partner.key, capabilities: partner.capabilities },
    });
    res.status(201).json({ partner });
  } catch (err) {
    next(err);
  }
}

export async function getPartner(req, res, next) {
  try {
    const id = req.params.id;
    if (!validId(id)) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');
    const partner = await Partner.findById(id).lean();
    if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');

    const links = await PartnerOperatorLink.find({ partnerId: partner._id })
      .populate('tenantId', 'name key status ownership baseCurrency')
      .lean();

    res.json({ partner, links });
  } catch (err) {
    next(err);
  }
}

export async function updatePartner(req, res, next) {
  try {
    const { status, capabilities, provisioningLimits, defaultCommercialTerms, contact, legalEntity } = req.body;
    const id = req.params.id;
    if (!validId(id)) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');
    const partner = await Partner.findById(id);
    if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'Partner not found');

    const previous = { status: partner.status, capabilities: [...(partner.capabilities || [])] };
    if (status) partner.status = status;
    if (capabilities) partner.capabilities = capabilities;
    if (provisioningLimits) partner.provisioningLimits = mergedSubdoc(partner.provisioningLimits, provisioningLimits);
    if (defaultCommercialTerms) {
      const merged = mergedSubdoc(partner.defaultCommercialTerms, defaultCommercialTerms);
      partner.defaultCommercialTerms = await assertValidCommercialTerms(merged);
    }
    if (contact) partner.contact = mergedSubdoc(partner.contact, contact);
    if (legalEntity) partner.legalEntity = mergedSubdoc(partner.legalEntity, legalEntity);

    await partner.save();
    await writePlatformLevelAudit(req, 'PARTNER_UPDATED', {
      targetId: partner._id,
      metadata: { before: previous, after: { status: partner.status, capabilities: partner.capabilities }, fields: Object.keys(req.body || {}) },
    });
    res.json({ partner });
  } catch (err) {
    next(err);
  }
}
