import mongoose from 'mongoose';
import Domain from '../../models/Domain.js';
import { createError } from '../../middleware/error.js';
import { verifyDomainDns, syncDomainTls } from '../services/domainService.js';
import { writePlatformAudit } from './platformTenantsController.js';

function validId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

async function findTenantDomain(tenantId, domainId) {
  if (!validId(domainId)) throw createError(404, 'DOMAIN_NOT_FOUND', 'Domain not found');
  const domain = await Domain.findOne({ _id: domainId, tenantId });
  if (!domain) throw createError(404, 'DOMAIN_NOT_FOUND', 'Domain not found');
  return domain;
}

export async function listDomains(req, res, next) {
  try {
    const filter = {};
    const tenantId = req.params.id || req.query.tenantId;
    if (tenantId) {
      if (!validId(tenantId)) throw createError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
      filter.tenantId = tenantId;
    }
    const domains = await Domain.find(filter).sort({ host: 1 }).lean();
    res.json({ domains });
  } catch (error) {
    next(error);
  }
}

export async function verifyDns(req, res, next) {
  try {
    const domain = await findTenantDomain(req.params.id, req.params.domainId);
    const result = await verifyDomainDns(domain._id);
    await writePlatformAudit(req, domain.tenantId, 'DOMAIN_DNS_VERIFICATION_TRIGGERED', {
      targetId: domain._id,
      metadata: { verified: result.verified },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function refreshTls(req, res, next) {
  try {
    const domain = await findTenantDomain(req.params.id, req.params.domainId);
    const result = await syncDomainTls(domain._id);
    await writePlatformAudit(req, domain.tenantId, 'DOMAIN_TLS_REFRESHED', {
      targetId: domain._id,
      metadata: { status: result.status },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}
