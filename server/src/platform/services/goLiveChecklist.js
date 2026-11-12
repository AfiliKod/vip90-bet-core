import Tenant from '../../models/Tenant.js';
import Domain from '../../models/Domain.js';

export async function evaluateGoLiveChecklist(tenantId) {
  const tenant = await Tenant.findById(tenantId);
  if (!tenant) throw new Error('Tenant not found');

  const primaryDomain = await Domain.findOne({ tenantId, isPrimary: true });

  const gates = {
    legalEntity: {
      passed: Boolean(tenant.legalEntity?.name && tenant.legalEntity?.registrationNo && tenant.legalEntity?.address),
      detail: tenant.legalEntity?.name ? 'Configured' : 'Missing legal entity details',
    },
    providerApproval: {
      // K22: casino content / igames requires written approval before live
      passed: Boolean(tenant.providerApproval?.approved),
      detail: tenant.providerApproval?.approved ? `Approved (${tenant.providerApproval.documentRef})` : 'Awaiting written provider approval',
    },
    pspSandbox: {
      passed: Boolean(tenant.checklist?.pspVerified),
      detail: tenant.checklist?.pspVerified ? 'Verified' : 'PSP sandbox deposit/withdrawal test pending',
    },
    kycWebhook: {
      passed: Boolean(tenant.checklist?.kycVerified),
      detail: tenant.checklist?.kycVerified ? 'Verified' : 'KYC webhook endpoint unverified',
    },
    emailSending: {
      passed: Boolean(tenant.checklist?.emailVerified),
      detail: tenant.checklist?.emailVerified ? 'Verified' : 'Email sender test unverified',
    },
    domainTls: {
      passed: Boolean(primaryDomain?.verifiedAt && primaryDomain?.tls?.status === 'active'),
      detail: primaryDomain?.verifiedAt ? 'DNS and TLS active' : 'DNS TXT verification or TLS pending',
    },
  };

  const allPassed = Object.values(gates).every((gate) => gate.passed);
  return { tenantId, allPassed, gates };
}