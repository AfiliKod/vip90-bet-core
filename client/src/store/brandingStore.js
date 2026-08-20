import { create } from 'zustand';

/**
 * BrandingInjector'ın doldurduğu, Navbar gibi bileşenlerin okuduğu paylaşılan
 * marka durumu (A3). Değer yoksa alanlar null kalır — okuyan taraf her zaman
 * kendi sabit varsayılanına (mevcut "VIP90.bet" metni gibi) düşer.
 */
export const useBrandingStore = create((set) => ({
  siteName: null,
  logo: null,
  loaded: false,
  setBranding: (values) => set({
    siteName: values.siteName || null,
    logo: values.logo || null,
    loaded: true,
  }),
}));
