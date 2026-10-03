// Sunucu `error.code` -> i18n anahtarı. Bilinmeyen kod -> genel mesaj.
const KNOWN = {
  PROMO_PERMISSION_DISABLED: 'permissionDisabled',
  PROMO_AGENT_BALANCE_LOW: 'agentBalanceLow',
  PROMO_CALL_DUPLICATE: 'callDuplicate',
  PROMO_CALL_ENDED: 'callEnded',
  PROMO_USER_NOT_FOUND: 'userNotFound',
  PROMO_GAME_NOT_FOUND: 'gameNotFound',
  PROMO_INVALID_PARAMS: 'invalidParams',
  PROMO_INVALID_EXPIRY: 'invalidExpiry',
  PROMO_PROVIDER_BUSY: 'providerBusy',
  PROMO_PROVIDER_ERROR: 'providerError',
  PROMO_BELOW_MIN: 'belowMin',
  PROMO_ABOVE_MAX: 'aboveMax',
  PROMO_NOT_CANCELLABLE: 'notCancellable',
  PROMO_GRANT_NOT_FOUND: 'grantNotFound',
  PLAY_NOT_ACTIVE: 'playNotActive',
  CALL_NOT_AVAILABLE: 'callNotAvailable',
  DEMO_ADMIN_READONLY: 'demoReadonly',
  FORBIDDEN: 'forbidden',
  VALIDATION_ERROR: 'invalidParams',
};

export function promoErrorKey(code) {
  return `admin.casinoPromo.errors.${KNOWN[code] || 'generic'}`;
}

/** Axios hatasından kullanıcıya gösterilecek çevrilmiş mesaj. */
export function promoErrorMessage(err, t) {
  const code = err?.response?.data?.error?.code;
  const msg = t(promoErrorKey(code));
  return code === 'PROMO_PERMISSION_DISABLED'
    ? `${msg} ${t('admin.casinoPromo.errors.permissionHint')}`
    : msg;
}
