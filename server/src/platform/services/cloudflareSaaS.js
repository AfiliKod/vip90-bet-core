const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

/**
 * Cloudflare for SaaS custom hostname adapter (K25).
 * Credentials come from the install environment; without them the adapter
 * answers a local placeholder so provisioning stays idempotent on dev installs.
 */
export class CloudflareSaaSClient {
  constructor({ apiToken = process.env.CLOUDFLARE_API_TOKEN, zoneId = process.env.CLOUDFLARE_ZONE_ID } = {}) {
    this.apiToken = apiToken;
    this.zoneId = zoneId;
  }

  get configured() {
    return Boolean(this.apiToken && this.zoneId);
  }

  async #request(path, init) {
    const res = await fetch(`${CF_API_BASE}/zones/${this.zoneId}/custom_hostnames${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Cloudflare for SaaS request failed with HTTP ${res.status}`);
    }
    const body = await res.json();
    return body?.result ?? body;
  }

  async createCustomHostname(hostname) {
    if (!this.configured) {
      return { id: `mock-${hostname}`, status: 'pending', ssl: { status: 'pending' } };
    }
    return this.#request('', {
      method: 'POST',
      body: JSON.stringify({
        hostname,
        ssl: { method: 'txt', type: 'dv' },
      }),
    });
  }

  async getCustomHostnameStatus(hostnameId) {
    if (!this.configured) {
      return { status: 'active', ssl: { status: 'active' } };
    }
    return this.#request(`/${encodeURIComponent(hostnameId)}`, { method: 'GET' });
  }
}

export default CloudflareSaaSClient;
