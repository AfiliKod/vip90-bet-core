import { useBetSlipStore } from '../store/betSlipStore';
import { formatOdd } from '../utils/oddsUtils';
import { useSettingsStore } from '../store/settingsStore';
import { BRAND_GRADIENT, BRAND_GLOW } from '../styles/brand';
import { useOddFlash } from '../hooks/useOddFlash';

export default function OddButton({ eventId, eventLabel, marketType, odd }) {
  const oddsFormat = useSettingsStore(s => s.preferences.oddsFormat);
  const { selections, addSelection } = useBetSlipStore();
  const selected = selections.some(s => s.eventId === eventId && s.marketType === marketType && s.oddId === odd.id);
  const flash = useOddFlash(odd.value);

  const flashClass = flash === 'up'
    ? 'ring-1 ring-green-400 bg-green-400/10'
    : flash === 'down'
    ? 'ring-1 ring-red-400 bg-red-400/10'
    : '';

  return (
    <button
      onClick={() => addSelection({ eventId, eventLabel, marketType, oddId: odd.id, oddLabel: odd.label, oddValue: odd.value })}
      className={`relative flex flex-col items-center justify-center min-h-[60px] px-4 py-3 rounded-xl text-sm transition-all duration-300 overflow-hidden ${flashClass} ${
        selected
          ? 'text-black scale-[1.02]'
          : 'bg-bg-base border-2 border-white/10 text-text-2 hover:border-[#00d4ff66] hover:text-text-1 hover:shadow-[0_0_16px_rgba(0,212,255,0.25)] hover:-translate-y-0.5'
      }`}
      style={selected ? {
        background: BRAND_GRADIENT,
        boxShadow: BRAND_GLOW,
        border: '2px solid #00d4ff66',
      } : {}}
    >
      {selected && (
        <span
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, transparent, #ffffffcc, transparent)' }}
        />
      )}
      <span className={`mb-1 truncate max-w-[90px] text-[11px] font-bold uppercase tracking-wide ${selected ? 'text-black/70' : 'text-text-3'}`}>
        {odd.label}
      </span>
      <span className={`font-black text-lg leading-none ${flash === 'up' ? 'text-green-300' : flash === 'down' ? 'text-red-300' : ''}`}>
        {formatOdd(odd.value, oddsFormat)}
      </span>
    </button>
  );
}