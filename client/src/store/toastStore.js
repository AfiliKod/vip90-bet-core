import { create } from 'zustand';
let id = 0;
export const useToastStore = create((set) => ({
  toasts: [],
  add: (msg, type = 'info') => {
    const toast = { id: ++id, msg, type };
    set(s => ({ toasts: [...s.toasts, toast] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== toast.id) })), 3500);
  },
}));
