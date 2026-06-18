import { useState, useRef, useCallback } from 'react';
import api from '../services/api';

export const SYMBOLS = [
  { id: 0, emoji: '🍒', label: 'Kiraz',    mult: 2,   weight: 30 },
  { id: 1, emoji: '🍋', label: 'Limon',    mult: 3,   weight: 25 },
  { id: 2, emoji: '🔔', label: 'Çan',      mult: 5,   weight: 20 },
  { id: 3, emoji: '⭐', label: 'Yıldız',   mult: 8,   weight: 12 },
  { id: 4, emoji: '💎', label: 'Elmas',    mult: 15,  weight: 8  },
  { id: 5, emoji: '7️⃣', label: 'Lucky 7', mult: 30,  weight: 4  },
  { id: 6, emoji: '🃏', label: 'Wild',     mult: 50,  weight: 1  },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((s, x) => s + x.weight, 0);

function pickSymbol() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (const sym of SYMBOLS) { r -= sym.weight; if (r <= 0) return sym.id; }
  return 0;
}

function spinGrid() {
  return Array.from({ length: 5 }, () => Array.from({ length: 3 }, pickSymbol));
}

const PAYLINES = [
  [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],
  [0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],
  [2,2,1,0,0],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],
];

function checkWins(grid, bet) {
  const wins = [];
  for (const [lineIdx, line] of PAYLINES.entries()) {
    const syms = line.map((row, col) => grid[col][row]);
    const nonWild = syms.filter(s => s !== 6);
    if (nonWild.length === 0) continue;
    const base = nonWild[0];
    let count = 0;
    for (const s of syms) { if (s === base || s === 6) count++; else break; }
    if (count >= 3) {
      const payout = Math.round(bet * SYMBOLS[base].mult * (count - 2));
      wins.push({ lineIdx, count, symbolId: base, payout });
    }
  }
  return wins;
}

export function useSlotGame({ onBalanceChange }) {
  const [bet, setBet] = useState(10);
  const [grid, setGrid] = useState(() => spinGrid());
  const [spinning, setSpinning] = useState(false);
  const [lastWins, setLastWins] = useState([]);
  const [spinCount, setSpinCount] = useState(0);
  const [error, setError] = useState(null);
  const spinLog = useRef([]);

  const spin = useCallback(async (currentBalance) => {
    if (spinning || currentBalance < bet) return;

    setSpinning(true);
    setLastWins([]);
    setError(null);

    const newGrid = spinGrid();
    const wins = checkWins(newGrid, bet);
    const payout = wins.reduce((s, w) => s + w.payout, 0);

    try {
      const { data } = await api.post('/casino/spin', { bet, payout });
      // Backend yeni bakiyeyi döndürür
      onBalanceChange(data.balance);
      spinLog.current.push({
        ts: Date.now(), bet, payout,
        wins: wins.map(w => ({ line: w.lineIdx, count: w.count, sym: SYMBOLS[w.symbolId].label, payout: w.payout })),
      });
      return { newGrid, wins, payout };
    } catch (e) {
      const msg = e.response?.data?.error?.message || 'Spin hatası';
      setError(msg);
      setSpinning(false);
      return null;
    }
  }, [spinning, bet, onBalanceChange]);

  const finishSpin = useCallback((newGrid, wins) => {
    setGrid(newGrid);
    setLastWins(wins);
    setSpinCount(c => c + 1);
    setSpinning(false);
  }, []);

  return { bet, setBet, grid, spinning, lastWins, spinCount, error, spin, finishSpin, SYMBOLS };
}
