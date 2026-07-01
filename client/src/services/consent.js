// Cookie consent yönetimi — localStorage tabanlı.
// Kategoriler: necessary (zorunlu), analytics, marketing.

const STORAGE_KEY = 'cookie-consent:v1';

const DEFAULTS = {
  necessary: true,  // her zaman true
  analytics: false,
  marketing: false,
};

export function getConsent() {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed.prefs, version: parsed.version, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
}

export function setConsent(prefs) {
  if (typeof window === 'undefined') return;
  const value = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    prefs: { ...DEFAULTS, ...prefs, necessary: true },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  // Custom event ile sayfa dinleyebilir
  window.dispatchEvent(new CustomEvent('cookieconsent:change', { detail: value.prefs }));
}

export function clearConsent() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function hasConsent() {
  return getConsent() !== null;
}

export function isAllowed(category) {
  const c = getConsent();
  if (!c) return category === 'necessary';
  return c[category] === true;
}