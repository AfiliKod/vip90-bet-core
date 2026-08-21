import { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../../i18n';
import { formatMoney, getActiveCurrency } from '../../utils/money.js';

function smartStep(n) {
  if (n < 10)   return 1;
  if (n < 50)   return 5;
  if (n < 200)  return 10;
  if (n < 1000) return 25;
  return 100;
}

function AutoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7.5a4.5 4.5 0 1 0 4.5-4.5" />
      <path d="M7.5 1v3M7.5 1L5.5 3.2M7.5 1l2 2.2" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" />
    </svg>
  );
}

// ─── BetControls ─────────────────────────────────────────────────────────────
// Props:
//   value, onChange, disabled, presets
//   onAuto, autoActive   — optional; shows auto icon in the row
//   potWin               — optional number; compact potential win row
//   balance              — optional number; shows balance bar at top
//   lastResult           — optional { net: number }; shows last round result
export default function BetControls({ value, onChange, disabled, presets, onAuto, autoActive, potWin, balance, lastResult }) {
  const { t } = useTranslation();
  const [open, setOpen]   = useState(false);
  const inputRef          = useRef(null);
  const wrapRef           = useRef(null);
  const num               = parseFloat(value) || 0;
  const ps                = presets ?? [10, 25, 50, 100, 250, 500];

  const decrement = () => {
    const s = smartStep(num);
    onChange(String(Math.max(1, Math.floor((num - s) / s) * s)));
  };
  const increment = () => {
    const s = smartStep(num);
    onChange(String(Math.min(10_000_000, Math.ceil((num + s) / s) * s)));
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus the manual input when dropdown opens
  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>

      {/* ── Balance + last result row ─────────────────────────────────────── */}
      {balance != null && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div>
            <div className="text-[9px] text-white/30 uppercase tracking-widest leading-tight">Bakiye</div>
            <div className="text-sm font-black text-white tabular-nums">{formatMoney(balance)}</div>
          </div>
          {lastResult != null && (
            <div className="text-right">
              <div className="text-[9px] text-white/30 uppercase tracking-widest leading-tight">Son El</div>
              <div className={`text-sm font-black tabular-nums ${lastResult.net > 0 ? 'text-green-400' : lastResult.net < 0 ? 'text-red-400' : 'text-white/40'}`}>
                {lastResult.net > 0 ? '+' : ''}{formatMoney(lastResult.net)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main row: [−]  [amount select trigger]  [+]  [auto?] ─────────── */}
      <div className="flex items-center gap-1.5">

        {/* Minus */}
        <button type="button" onClick={decrement} disabled={disabled}
          className="w-11 h-11 shrink-0 rounded-xl border border-white/15 hover:border-primary/50 hover:bg-primary/10 active:scale-90 disabled:opacity-30 transition-all touch-manipulation flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-text-1">
            <rect x="2" y="6.25" width="10" height="1.5" rx="0.75" />
          </svg>
        </button>

        {/* Amount trigger — opens dropdown on click */}
        <button type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className="flex-1 h-11 rounded-xl border border-white/15 hover:border-primary/60 focus:border-primary/70 disabled:opacity-40 transition-all flex items-center justify-between px-3 gap-2"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="text-[11px] text-text-3 font-bold">{getActiveCurrency().symbol}</span>
          <span className="text-sm font-black text-white tabular-nums flex-1 text-center">
            {num > 0 ? num.toLocaleString('tr-TR') : '0'}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`text-text-3 transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Plus */}
        <button type="button" onClick={increment} disabled={disabled}
          className="w-11 h-11 shrink-0 rounded-xl border border-primary/35 hover:border-primary/60 hover:bg-primary/20 active:scale-90 disabled:opacity-30 transition-all touch-manipulation flex items-center justify-center"
          style={{ background: 'rgba(139,92,246,0.12)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-primary">
            <rect x="2" y="6.25" width="10" height="1.5" rx="0.75" />
            <rect x="6.25" y="2" width="1.5" height="10" rx="0.75" />
          </svg>
        </button>

        {/* Auto icon (optional) */}
        {onAuto && (
          <button type="button" onClick={onAuto}
            disabled={disabled && !autoActive}
            title={autoActive ? t('games.stopAuto') : t('games.autoBet')}
            className={`w-11 h-11 shrink-0 rounded-xl border transition touch-manipulation disabled:opacity-40 flex items-center justify-center
              ${autoActive
                ? 'bg-red-500/15 border-red-500/40 text-red-400'
                : 'bg-white/5 border-white/15 text-text-3 hover:border-primary/50 hover:text-primary'}`}>
            {autoActive ? <StopIcon /> : <AutoIcon />}
          </button>
        )}
      </div>

      {/* ── Dropdown ─────────────────────────────────────────────────────── */}
      {open && !disabled && (
        <div className="rounded-2xl border border-white/12 p-3 animate-slide-up"
          style={{ background: 'rgba(13,20,38,0.98)', backdropFilter: 'blur(20px)' }}>

          {/* Manual input */}
          <input
            ref={inputRef}
            type="number"
            inputMode="decimal"
            min="1"
            step="1"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full h-9 rounded-xl border border-white/20 px-3 text-sm font-black text-white text-center focus:outline-none focus:border-primary/70 mb-2.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          />

          {/* Preset grid */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {ps.map(v => (
              <button key={v} type="button"
                onMouseDown={e => { e.preventDefault(); onChange(String(v)); setOpen(false); }}
                className={`py-2 rounded-xl text-xs font-black transition-all touch-manipulation active:scale-95 border
                  ${num === v
                    ? 'bg-primary text-white border-primary/80 shadow-lg shadow-primary/20'
                    : 'border-white/10 text-text-2 hover:border-primary/40 hover:text-primary'}`}
                style={num !== v ? { background: 'rgba(255,255,255,0.04)' } : {}}>
                {getActiveCurrency().symbol}{v >= 1000 ? `${v / 1000}K` : v}
              </button>
            ))}
          </div>

          {/* ½ and ×2 */}
          <div className="flex gap-1.5">
            {[
              { label: '½', fn: () => Math.max(1, Math.floor(num * 0.5)) },
              { label: '×2', fn: () => Math.min(10_000_000, num * 2) },
            ].map(({ label, fn }) => (
              <button key={label} type="button"
                onMouseDown={e => { e.preventDefault(); onChange(String(fn())); setOpen(false); }}
                className="flex-1 py-1.5 rounded-lg border border-white/10 text-xs font-black text-text-3 hover:text-primary hover:border-primary/30 transition"
                style={{ background: 'rgba(255,255,255,0.03)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Potential win ─────────────────────────────────────────────────── */}
      {potWin != null && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-text-3 font-medium">Pot. kazanç</span>
          <span className="text-[11px] font-black text-green-400 tabular-nums">
            {formatMoney(typeof potWin === 'number' ? potWin.toFixed(2) : potWin)}
          </span>
        </div>
      )}
    </div>
  );
}
