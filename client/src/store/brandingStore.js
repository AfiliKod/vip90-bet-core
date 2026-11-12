import { create } from 'zustand';

/**
 * BrandingInjector'ın doldurduğu, Navbar gibi bileşenlerin okuduğu paylaşılan
 * marka durumu (A3). Değer yoksa alanlar null kalır — okuyan taraf kendi
 * nötr varsayılanına düşer. legalEntity, /api/branding'in döndüğü
 * Tenant.legalEntity alanıdır (yasal unvan, sicil no, adres).
 */
export const useBrandingStore = create((set) => ({
  siteName: null,
  logo: null,
  legalEntity: null,
  loaded: false,
  setBranding: (values, { legalEntity = null } = {}) => set({
    siteName: values.siteName || null,
    logo: values.logo || null,
    legalEntity: legalEntity || null,
    loaded: true,
  }),
}));
