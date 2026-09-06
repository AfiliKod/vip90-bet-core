import crypto from 'crypto';
import { kycConfig } from '../config/kyc.js';
import { errorLogger } from './errorLogger.js';

const API_BASE = 'https://api.sumsub.com';

function hmacSignature(secretKey, ts, method, urlPath, body = '') {
  const payload = ts + method + urlPath + body;
  return crypto.createHmac('sha256', secretKey).update(payload).digest('hex');
}

function normalizeResult(status, text) {
  try {
    return { status, data: JSON.parse(text) };
  } catch {
    return { status, data: text };
  }
}

async function apiRequest(method, path, body = null) {
  const appToken = await kycConfig.get('SUMSUB_APP_TOKEN');
  const secretKey = await kycConfig.get('SUMSUB_SECRET_KEY');
  if (!appToken || !secretKey) {
    throw new Error('Sumsub API anahtarlari tanimli degil. KYC ayarlarini kontrol edin.');
  }

  const url = `${API_BASE}${path}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const hasBody = body !== null && body !== undefined;
  const bodyStr = hasBody ? JSON.stringify(body) : '';

  const sig = hmacSignature(secretKey, ts, method, path, bodyStr);

  let response;
  const startTime = Date.now();
  try {
    response = await fetch(url, {
      method,
      headers: {
        'X-App-Token': appToken,
        'X-App-Access-Sig': `sha256=${sig}`,
        'X-App-Access-Ts': ts,
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: bodyStr } : {}),
    });
  } catch (e) {
    errorLogger.critical('sumsub_api_network', `Network error: ${method} ${path}`, {
      error: e.message,
      latency_ms: Date.now() - startTime,
    });
    throw e;
  }

  const text = await response.text();
  const result = normalizeResult(response.status, text);
  const latency = Date.now() - startTime;
  if (!response.ok) {
    const message = result.data?.description || result.data?.error || text || `Sumsub API error ${response.status}`;
    const level = response.status >= 500 ? 'critical' : 'warn';
    errorLogger[level]('sumsub_api_error', `${method} ${path} → ${response.status}`, {
      latency_ms: latency,
      message,
    });
    throw new Error(message);
  }
  if (latency > 5000) {
    errorLogger.warn('sumsub_api_slow', `${method} ${path}`, { latency_ms: latency });
  }
  return result;
}

export async function createApplicant(userId, email, opts = {}) {
  const levelName = opts.levelName || await kycConfig.get('SUMSUB_LEVEL_NAME') || 'basic-kyc-level';
  const body = {
    externalUserId: userId.toString(),
    email,
    fixedInfo: opts.country ? { country: opts.country } : undefined,
  };
  const path = `/resources/applicants?levelName=${encodeURIComponent(levelName)}`;
  return apiRequest('POST', path, body);
}

export async function generateSDKToken(applicantId, levelName, opts = {}) {
  const lvl = levelName || await kycConfig.get('SUMSUB_LEVEL_NAME') || 'basic-kyc-level';
  const body = {
    applicantId,
    levelName: lvl,
    ...opts,
  };
  return apiRequest('POST', '/resources/accessTokens/sdk', body);
}

export async function getApplicantReviewStatus(applicantId) {
  return apiRequest('GET', `/resources/applicants/${applicantId}/review`);
}
