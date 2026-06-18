import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const ACCENT_COLORS = {
  cyan:   { primary: '#00d4ff', dark: '#00aed4' },
  purple: { primary: '#a855f7', dark: '#9333ea' },
  green:  { primary: '#10b981', dark: '#059669' },
  orange: { primary: '#f97316', dark: '#ea580c' },
};

const DEFAULTS = {
  avatarColor: '#7c3aed',
  favoriteSports: [],
  accentColor: 'cyan',
  oddsFormat: 'decimal',
  language: 'tr',
  notifyLive: true,
  notifyOddsChange: false,
  defaultStake: 10,
};

function applyAccent(color) {
  const c = ACCENT_COLORS[color];
  if (!c) return;
  document.documentElement.style.setProperty('--color-primary', c.primary);
  document.documentElement.style.setProperty('--color-primary-dark', c.dark);
}

export { ACCENT_COLORS };

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      preferences: { ...DEFAULTS },
      isDirty: false,
      isLoading: false,

      load: async () => {
        set({ isLoading: true });
        try {
          const { data } = await api.get('/users/me/preferences');
          const prefs = { ...DEFAULTS, ...data.preferences };
          set({ preferences: prefs, isDirty: false, isLoading: false });
          applyAccent(prefs.accentColor);
        } catch { set({ isLoading: false }); }
      },

      updatePreference: (key, value) => {
        set(s => ({ preferences: { ...s.preferences, [key]: value }, isDirty: true }));
        if (key === 'accentColor') applyAccent(value);
      },

      save: async () => {
        const { preferences } = get();
        await api.put('/users/me/preferences', preferences);
        set({ isDirty: false });
      },

      reset: () => set(s => ({ preferences: { ...s.preferences }, isDirty: false })),
    }),
    {
      name: 'betzone-settings',
      partialize: s => ({ preferences: s.preferences }),
    }
  )
);
