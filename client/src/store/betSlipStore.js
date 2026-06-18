import { create } from 'zustand';
export const useBetSlipStore = create((set, get) => ({
  selections: [],
  type: 'single',
  stake: '',
  addSelection: (sel) => {
    const { selections } = get();
    const sameOdd = selections.find(s => s.eventId === sel.eventId && s.marketType === sel.marketType && s.oddId === sel.oddId);
    if (sameOdd) {
      set(s => ({ selections: s.selections.filter(x => !(x.eventId === sel.eventId && x.marketType === sel.marketType && x.oddId === sel.oddId)) }));
      return;
    }
    const sameMarket = selections.find(s => s.eventId === sel.eventId && s.marketType === sel.marketType);
    if (sameMarket) {
      set(s => ({ selections: s.selections.map(x => x.eventId === sel.eventId && x.marketType === sel.marketType ? sel : x) }));
      return;
    }
    set(s => ({ selections: [...s.selections, sel] }));
  },
  removeSelection: (eventId, marketType) => set(s => ({ selections: s.selections.filter(x => !(x.eventId === eventId && x.marketType === marketType)) })),
  setType: (type) => set({ type }),
  setStake: (stake) => set({ stake }),
  clear: () => set({ selections: [], stake: '' }),
  getTotalOdds: () => {
    const { selections, type } = get();
    if (!selections.length) return 0;
    if (type === 'single') return selections[0]?.oddValue || 0;
    return +selections.reduce((acc, s) => acc * s.oddValue, 1).toFixed(3);
  },
}));
