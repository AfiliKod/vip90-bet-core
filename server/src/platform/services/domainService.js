import { resolveTxt } from 'node:dns/promises';
import Domain from '../../models/Domain.js';
import { CloudflareSaaSClient } from './cloudflareSaaS.js';
import { clearDomainHostCache } from '../../middleware/tenantHost.js';

/** Label prefixed to the operator host for the ownership TXT challenge. */
export const TXT_CHALLENGE_PREFIX = '_domain-verify';

/**
 * Verifies domain ownership through a DNS TXT record (K25, spec G-11).
 * Accepts the token at the challenge label or at the bare host, then stamps
 * `verifiedAt` so `resolveTenantHost` may serve the domain.
 */
export async function verifyDomainDns(domainId, { resolver = resolveTxt } = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) throw new Error('Domain not found');
  if (domain.verifiedAt) return { verified: true, verifiedAt: domain.verifiedAt };

  const expectedToken = domain.txtVerificationToken;
  if (!expectedToken) throw new Error('Domain has no verification token configured');

  const targets = [`${TXT_CHALLENGE_PREFIX}.${domain.host}`, domain.host];
  let matched = false;

  for (const target of targets) {
    try {
      const records = await resolver(target);
      const flat = records.flat();
      if (flat.includes(expectedToken)) {
        matched = true;
        break;
      }
    } catch {
      // Record missing at this label; the next candidate may still hold it.
    }
  }

  if (matched) {
    domain.verifiedAt = new Date();
    await domain.save();
    // A cached "unknown host" answer must not outlive the verification.
    clearDomainHostCache(domain.host);
    return { verified: true, verifiedAt: domain.verifiedAt };
  }

  return { verified: false, expectedToken, targets };
}

/**
 * Pulls the custom hostname certificate state from Cloudflare for SaaS and
 * stores it on the domain. TLS never turns a domain unverified.
 */
export async function syncDomainTls(domainId, { cfClient = new CloudflareSaaSClient() } = {}) {
  const domain = await Domain.findById(domainId);
  if (!domain) throw new Error('Domain not found');

  const status = await cfClient.getCustomHostnameStatus(domain.tls?.customHostnameId || domain.host);
  const tlsStatus = status.ssl?.status === 'active' || status.status === 'active' ? 'active' : 'pending';

  domain.set('tls.status', tlsStatus);
  domain.set('tls.provider', 'cloudflare');
  await domain.save();
  return { status: tlsStatus };
}
