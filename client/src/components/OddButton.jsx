import { useRef, useEffect, useState } from 'react';
import { useBetSlipStore } from '../store/betSlipStore';
import { formatOdd } from '../utils/oddsUtils';
import { useSettingsStore } from '../store/settingsStore';

export default function OddButton({ eventId, eventLabel, marketType, odd }) {
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  const selected = selections.some(s => s.eventId === eventId && s.marketType === marketType && s.oddId === odd.id);
  const prevValue = useRef(odd.value);
  const [flash, setFlash] = useState(null); // 'up' | 'down' | null

  useEffect(() => {
    if (odd.value !== prevValue.current) {
      setFlash(odd.value > prevValue.current ? 'up' : 'down');
      prevValue.current = odd.value;
      const t = setTimeout(() => setFlash(null), 1200);
      return () => clearTimeout(t);
    }
  }, [odd.value]);

  const flashClass = flash === 'up'
    ? 'ring-1 ring-green-400 bg-green-400/10'
    : flash === 'down'
    ? 'ring-1 ring-red-400 bg-red-400/10'
    : '';

  return (
    <button
      onClick={() => addSelection({ eventId, eventLabel, marketType, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value })}
      className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs transition-all duration-300 ${flashClass} ${
        selected
          ? 'bg-primary/20 border-primary text-primary'
          : 'bg-bg-base border-white/10 text-text-2 hover:border-primary/50 hover:text-text-1'
      }`}
    >
      <span className="text-text-3 mb-0.5 truncate max-w-[80px]">{odd.label}</span>
      <span className={`font-bold text-sm ${flash === 'up' ? 'text-green-400' : flash === 'down' ? 'text-red-400' : ''}`}>
        {formatOdd(odd.value, oddsFormat)}
      </span>
    </button>
  );
}
