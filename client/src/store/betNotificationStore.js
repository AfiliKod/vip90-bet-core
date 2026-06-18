import { create } from 'zustand';

// Session bazlı okunmamış bahis bildirimi sayacı
export const useBetNotificationStore = create((set) => ({
  unread: 0,
  increment: () => set(s => ({ unread: s.unread + 1 })),
  reset: () => set({ unread: 0 }),
}));
