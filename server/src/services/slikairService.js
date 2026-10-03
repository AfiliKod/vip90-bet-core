/**
 * Slikair Payment Gateway Service
 *
 * Handles HTTP communication with Slikair API v2.
 * Uses merchant-token for authentication and Idempotency-Key for duplicate prevention.
 */
import { randomUUID as uuidv4 } from 'node:crypto';
import { SLIKAIR_SETTINGS } from '../config/slikair.js';
import { getSlikairCredentials } from '../config/slikairConfig.js';

/**
 * Make an authenticated request to Slikair API.
 * @param {string} endpoint - API path (e.g., '/payment/create')
 * @param {Object} body - Request body
 * @param {Object} opts - Options { idempotencyKey }
 * @returns {Object} Parsed JSON response
 */
async function request(endpoint, body, opts = {}) {
  const creds = await getSlikairCredentials();
  const url = `${creds.baseUrl}${endpoint}`;
  const idempotencyKey = opts.idempotencyKey || uuidv4();

  const headers = {
    'Content-Type': 'application/json',
    'merchant-token': creds.merchantToken,
    'Idempotency-Key': idempotencyKey,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SLIKAIR_SETTINGS.timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(data?.message || `Slikair API error: ${res.status}`);
      err.status = res.status;
      err.code = data?.error_code || data?.reason_code || 'SLIKAIR_API_ERROR';
      err.payinId = data?.payin_id || null;
      err.details = data?.details || null;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a payment session.
 * Returns redirect_url for hosted payment page.
 *
 * @param {Object} params - Payment parameters
 * @param {Object} opts - Options { idempotencyKey }
 * @returns {Object} { status, status_code, request_id, payin_id, redirect_url, created_at }
 */
export async function createPayment(params, opts = {}) {
  const {
    amount, currency, paymentMethod, email, country,
    firstName, lastName, cardNum, cardHolder,
    cardExpireMonth, cardExpireYear, cardCvv,
    mobile, address, city, zipCode, state, birthDate,
    deviceIp, notificationLink,
  } = params;

  const creds = await getSlikairCredentials();
  const { success_url, pending_url, fail_url, back_url } = (await import('../config/slikair.js')).getRedirectUrls();

  const body = {
    merchant_id: creds.merchantId,
    merchant_site_id: creds.siteId,
    payment_method: paymentMethod,
    device_ip: deviceIp || '127.0.0.1',
    amount,
    currency,
    email,
    request_id: opts.idempotencyKey || uuidv4(),
    country,
    first_name: firstName,
    last_name: lastName,
    notification_link: notificationLink || (await import('../config/slikair.js')).getWebhookUrl('payin'),
    success_url,
    pending_url,
    fail_url,
    back_url,
  };

  // Kredi kartı alanları
  if (cardNum) body.cardNum = cardNum;
  if (cardHolder) body.cardHolder = cardHolder;
  if (cardExpireMonth) body.cardExpireMonth = cardExpireMonth;
  if (cardExpireYear) body.cardExpireYear = cardExpireYear;
  if (cardCvv) body.cardCvv = cardCvv;

  // Ek alanlar
  if (mobile) body.mobile = mobile;
  if (address) body.address = address;
  if (city) body.city = city;
  if (zipCode) body.zipCode = zipCode;
  if (state) body.state = state;
  if (birthDate) body.birthDate = birthDate;

  return request('/payment/create', body, opts);
}

/**
 * Get payment status.
 * @param {string} payinId - Slikair payin ID
 * @returns {Object} Payment status details
 */
export async function getPaymentStatus(payinId) {
  const creds = await getSlikairCredentials();
  const body = {
    merchant_id: creds.merchantId,
    payin_id: payinId,
  };
  return request('/payment/get-status', body);
}

/**
 * Create a payout (withdrawal).
 * @param {Object} params - Payout parameters
 * @param {Object} opts - Options { idempotencyKey }
 * @returns {Object} Payout creation result
 */
export async function createPayout(params, opts = {}) {
  const {
    amount, currency, method, country,
    merchantReference, notificationUrl,
    customer, paymentDetails,
  } = params;

  const creds = await getSlikairCredentials();
  const body = {
    merchant_id: creds.merchantId,
    method,
    site_id: creds.siteId,
    mode: 'direct',
    amount,
    currency,
    merchantReference,
    country,
    notificationUrl: notificationUrl || (await import('../config/slikair.js')).getWebhookUrl('payout'),
    customer,
    paymentDetails,
  };

  return request('/payouts/create', body, opts);
}

/**
 * Get payout status.
 * @param {string} payoutId - Slikair payout ID
 * @returns {Object} Payout status details
 */
export async function getPayoutStatus(payoutId) {
  const creds = await getSlikairCredentials();
  const body = {
    merchant_id: creds.merchantId,
    payout_id: payoutId,
  };
  return request('/payouts/get-status', body);
}
