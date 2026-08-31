// A1/A2 tema token'larına bağlı — admin panelinden renk değişince (ThemeStyleInjector)
// buradaki tüm gradient/glow/border değerleri de otomatik güncellenir, sabit hex değil.
export const BRAND_GRADIENT = 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)';
export const BRAND_GRADIENT_H = 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-accent) 100%)';
export const BRAND_GLOW = '0 0 12px color-mix(in srgb, var(--color-primary) 33%, transparent), 0 0 24px color-mix(in srgb, var(--color-accent) 20%, transparent)';

export function brandText(props = {}) {
  return {
    background: BRAND_GRADIENT_H,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    ...props,
  };
}

export const BRAND_BORDER = '1px solid color-mix(in srgb, var(--color-primary) 27%, transparent)';
export const BRAND_RING = '0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent) inset, 0 0 16px color-mix(in srgb, var(--color-primary) 20%, transparent)';
