export const BRAND_GRADIENT = 'linear-gradient(135deg, #00d4ff 0%, #7c3aed 100%)';
export const BRAND_GRADIENT_H = 'linear-gradient(90deg, #00d4ff 0%, #7c3aed 100%)';
export const BRAND_GLOW = '0 0 12px #00d4ff55, 0 0 24px #7c3aed33';

export function brandText(props = {}) {
  return {
    background: BRAND_GRADIENT_H,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    ...props,
  };
}

export const BRAND_BORDER = '1px solid #00d4ff44';
export const BRAND_RING = '0 0 0 1px #00d4ff66 inset, 0 0 16px #00d4ff33';