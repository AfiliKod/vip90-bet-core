import crypto from 'node:crypto';
import Tenant from '../../models/Tenant.js';
import Brand from '../../models/Brand.js';
import Domain from '../../models/Domain.js';
import StaffAccount from '../../models/StaffAccount.js';
import Role from '../../models/Role.js';
import RoleAssignment from '../../models/RoleAssignment.js';
import AuditLog from '../../models/AuditLog.js';
import Partner from '../../models/Partner.js';
import PartnerOperatorLink from '../../models/PartnerOperatorLink.js';
import { createError } from '../../middleware/error.js';
import { runWithTenant } from '../../tenancy/context.js';
import { runTenantProvisioningHooks } from '../../tenancy/provisioning.js';
import { seedTenantSubset } from './tenantSeed.js';
import { createStaffInvite } from './staffInvite.js';

/**
 * Create the platform-owned records and essential tenant subset for a new
 * operator. Repeating the request for the same tenant key is safe.
 *
 * @param {object} data
 * @param {string} data.key
 * @param {string} data.name
 * @param {object} [data.legalEntity]
 * @param {string} [data.baseCurrency]
 * @param {string} [data.timezone]
 * @param {string} [data.defaultLocale]
 * @param {string} data.domain
 * @param {string} [data.ownerEmail]
 * @param {string} [data.ownerUsername]
 * @param {object} [data.entitlements]
 * @param {object} [data.credentials]
 * @param {{ createdByStaffId?: import('mongoose').Types.ObjectId|string|null, partnerId?: import('mongoose').Types.ObjectId|string|null, createdVia?: 'platform'|'partner' }} [options]
 */
export async function provisionTenant({
  key,
  name,
  legalEntity = {},
  baseCurrency = 'TRY',
  timezone = 'Europe/Istanbul',
  defaultLocale = 'tr-TR',
  domain,
  ownerEmail,
  ownerUsername,
  entitlements = {},
  credentials = {},
} = {}, { createdByStaffId = null, partnerId = null, createdVia = 'platform' } = {}) {
  if (!key || typeof key !== 'string') throw new Error('Tenant key is required');
  if (!name || typeof name !== 'string') throw new Error('Tenant name is required');
  if (!domain || typeof domain !== 'string') throw new Error('Primary domain is required');

  // Credential schemas and their secure storage are supplied by registered
  // modules; never log the input while provisioning.
  void credentials;

  const normalizedKey = key.toLowerCase().trim();
  const normalizedDomain = domain.toLowerCase().trim();

  let tenant = await Tenant.findOne({ key: normalizedKey });

  let effectiveOwnership = 'direct';
  let effectiveCreatedVia = createdVia;
  let partner = null;

  if (partnerId) {
    partner = await Partner.findById(partnerId);
    if (!partner) throw createError(404, 'PARTNER_NOT_FOUND', 'PARTNER_NOT_FOUND: Partner not found');
    if (partner.status !== 'active') {
      throw createError(403, 'PARTNER_NOT_ACTIVE', 'PARTNER_NOT_ACTIVE: Partner is not active');
    }

    const allowedModules = new Set(partner.provisioningLimits.allowedModules || []);
    const forbidden = (entitlements.modules || []).filter((m) => !allowedModules.has(m));
    if (forbidden.length > 0) {
      throw createError(400, 'MODULE_NOT_ALLOWED', `MODULE_NOT_ALLOWED: Requested modules not allowed for this partner: ${forbidden.join(', ')}`);
    }

    // Re-provisioning an operator already linked to this partner is not a new
    // tenant, so it must not count against the quota.
    const activeLinksCount = await PartnerOperatorLink.countDocuments({
      partnerId: partner._id,
      validTo: null,
      ...(tenant ? { tenantId: { $ne: tenant._id } } : {}),
    });
    if (activeLinksCount >= partner.provisioningLimits.maxTenants) {
      throw createError(400, 'MAX_TENANTS_EXCEEDED', `MAX_TENANTS_EXCEEDED: Tenant limit reached (${partner.provisioningLimits.maxTenants})`);
    }

    // An existing key belongs to whoever created it: a partner can only
    // re-run provisioning for its own operator, never adopt another tenant.
    if (tenant) {
      const ownLink = await PartnerOperatorLink.exists({ partnerId: partner._id, tenantId: tenant._id, validTo: null });
      if (!ownLink) throw createError(409, 'TENANT_KEY_TAKEN', 'TENANT_KEY_TAKEN: Tenant key is already in use');
    }

    effectiveOwnership = 'partner';
    effectiveCreatedVia = 'partner';
  } else if (tenant && tenant.ownership === 'partner') {
    // The platform path must not silently rewrite a partner-owned operator.
    throw createError(409, 'TENANT_KEY_TAKEN', 'TENANT_KEY_TAKEN: Tenant key is already in use');
  }

  if (!tenant) {
    tenant = await Tenant.create({
      key: normalizedKey,
      name: name.trim(),
      legalEntity: {
        name: legalEntity.name || null,
        registrationNo: legalEntity.registrationNo || null,
        address: legalEntity.address || null,
      },
      status: 'provisioning',
      ownership: effectiveOwnership,
      createdVia: effectiveCreatedVia,
      createdBy: createdByStaffId,
      baseCurrency,
      timezone,
      defaultLocale,
      entitlements: {
        modules: entitlements.modules || [],
        limits: entitlements.limits || {},
      },
    });
  }

  const brand = await runWithTenant(tenant._id, async () => {
    let existingBrand = await Brand.findOne({ tenantId: tenant._id, isDefault: true });
    if (!existingBrand) {
      existingBrand = await Brand.create({
        tenantId: tenant._id,
        name: tenant.name,
        slug: normalizedKey,
        isDefault: true,
      });
    }
    return existingBrand;
  });

  let domainDoc = await Domain.findOne({ host: normalizedDomain });
  if (domainDoc && String(domainDoc.tenantId) !== String(tenant._id)) {
    throw new Error('Primary domain is already assigned to another tenant');
  }
  if (!domainDoc) {
    const domainData = {
      host: normalizedDomain,
      tenantId: tenant._id,
      brandId: brand._id,
      isPrimary: true,
      purpose: 'player',
      verifiedAt: null,
      tls: { status: 'pending', provider: 'cloudflare' },
    };
    if (Domain.schema.path('txtVerificationToken')) {
      domainData.txtVerificationToken = `tenant-domain-challenge-${crypto.randomBytes(16).toString('hex')}`;
    }
    domainDoc = await Domain.create(domainData);
  }

  await seedTenantSubset(tenant._id, { brandName: tenant.name });
  await runTenantProvisioningHooks(tenant);

  let ownerInvite = null;
  if (ownerEmail) {
    const normalizedEmail = ownerEmail.toLowerCase().trim();
    let staff = await StaffAccount.findOne({ email: normalizedEmail });
    if (!staff) {
      // The random password is never shown; the owner sets one through the
      // one-time invitation below (2FA enrolment follows at first login).
      staff = await StaffAccount.create({
        email: normalizedEmail,
        username: ownerUsername || normalizedEmail.split('@')[0],
        password: crypto.randomBytes(16).toString('base64url'),
        status: 'active',
        twoFactor: { enabled: false },
      });
      ownerInvite = await createStaffInvite(staff._id, { createdBy: createdByStaffId });
    }

    const tenantOwnerRole = await Role.findOne({ name: 'tenant_owner', scopeType: 'tenant', scopeId: null });
    if (tenantOwnerRole) {
      await RoleAssignment.findOneAndUpdate(
        { staffId: staff._id, scopeType: 'tenant', scopeId: tenant._id, roleId: tenantOwnerRole._id },
        {
          $setOnInsert: {
            staffId: staff._id,
            scopeType: 'tenant',
            scopeId: tenant._id,
            roleId: tenantOwnerRole._id,
            grantedBy: createdByStaffId,
          },
        },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
  }

  await runWithTenant(tenant._id, () => AuditLog.findOneAndUpdate(
    { action: 'TENANT_PROVISIONED', targetType: 'system', targetId: tenant._id.toString() },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        actorType: 'admin',
        actorUsername: 'platform',
        actorScope: 'platform',
        actorStaffId: createdByStaffId,
        action: 'TENANT_PROVISIONED',
        category: 'system',
        targetType: 'system',
        targetId: tenant._id.toString(),
        metadata: { tenantKey: tenant.key, domain: normalizedDomain },
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ));

  if (partner) {
    await PartnerOperatorLink.findOneAndUpdate(
      { partnerId: partner._id, tenantId: tenant._id, validTo: null },
      {
        $setOnInsert: {
          partnerId: partner._id,
          tenantId: tenant._id,
          validFrom: new Date(),
          validTo: null,
          capabilities: null,
          commercialTerms: partner.defaultCommercialTerms,
          createdBy: createdByStaffId,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    await runWithTenant(tenant._id, () => AuditLog.findOneAndUpdate(
      { action: 'PARTNER_TENANT_PROVISIONED', targetType: 'system', targetId: tenant._id.toString() },
      {
        $setOnInsert: {
          tenantId: tenant._id,
          actorType: 'admin',
          actorUsername: 'partner',
          actorScope: 'partner',
          actorStaffId: createdByStaffId,
          partnerId: partner._id,
          onBehalfOfTenantId: tenant._id,
          action: 'PARTNER_TENANT_PROVISIONED',
          category: 'system',
          targetType: 'system',
          targetId: tenant._id.toString(),
          capability: 'tenants.create',
          metadata: { tenantKey: tenant.key, domain: normalizedDomain },
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ));
  }

  return {
    success: true,
    tenantId: tenant._id,
    tenant,
    key: tenant.key,
    domain: domainDoc.host,
    status: tenant.status,
    // Raw invitation token, returned once when the owner account is created.
    ownerInvite,
  };
}
