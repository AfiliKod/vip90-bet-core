import crypto from 'node:crypto';
import Tenant from '../../models/Tenant.js';
import Brand from '../../models/Brand.js';
import Domain from '../../models/Domain.js';
import StaffAccount from '../../models/StaffAccount.js';
import Role from '../../models/Role.js';
import RoleAssignment from '../../models/RoleAssignment.js';
import AuditLog from '../../models/AuditLog.js';
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
 * @param {{ createdByStaffId?: import('mongoose').Types.ObjectId|string|null }} [options]
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
} = {}, { createdByStaffId = null } = {}) {
  if (!key || typeof key !== 'string') throw new Error('Tenant key is required');
  if (!name || typeof name !== 'string') throw new Error('Tenant name is required');
  if (!domain || typeof domain !== 'string') throw new Error('Primary domain is required');

  // Credential schemas and their secure storage are supplied by registered
  // modules; never log the input while provisioning.
  void credentials;

  const normalizedKey = key.toLowerCase().trim();
  const normalizedDomain = domain.toLowerCase().trim();

  let tenant = await Tenant.findOne({ key: normalizedKey });
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
      ownership: 'direct',
      createdVia: 'platform',
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

  return {
    success: true,
    tenantId: tenant._id,
    key: tenant.key,
    domain: domainDoc.host,
    status: tenant.status,
    // Raw invitation token, returned once when the owner account is created.
    ownerInvite,
  };
}
