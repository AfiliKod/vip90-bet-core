import { useState, useRef } from 'react';

function smartStep(n) {
  if (n < 10)  return 1;
  if (n < 50)  return 5;
  if (n < 200) return 10;
  if (n < 1000) return 25;
  return 100;
}

export default function BetControls({ value, onChange, disabled, presets, label = 'Bahis' }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const num = parseFloat(value) || 0;
  const ps = presets ?? [10, 25, 50, 100, 250, 500];

  const decrement = () => {
    const step = smartStep(num);
    onChange(String(Math.max(1, Math.floor((num - step) / step) * step)));
  };
  const increment = () => {
    const step = smartStep(num);
    onChange(String(Math.min(10_000_000, Math.ceil((num + step) / step) * step)));
  };

  return (
    <div>
      {/* Label */}
      <label className="flex items-center gap-1.5 mb-2">
        <span className="text-[10px] font-black uppercase tracking-widest bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          {label}
        </span>
        <span className="text-[9px] text-primary/60 font-bold">₺</span>
        <span className="ml-auto text-[9px] text-text-3 font-medium">
          {num > 0 && `${num.toLocaleString('tr-TR')} ₺`}
        </span>
      </label>

      {/* Input row: [−] [input] [+] */}
      <div className="flex items-center gap-2">

        {/* Minus */}
        <button
          type="button"
          onClick={decrement}
          disabled={disabled}
          className="w-11 h-11 flex-shrink-0 rounded-xl border border-white/15 hover:border-primary/50 hover:bg-primary/10 active:scale-90 disabled:opacity-30 transition-all duration-150 touch-manipulation flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.05)' }}
          aria-label="Azalt"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-text-1">
            <rect x="3" y="7.25" width="10" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>

        {/* Input */}
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          disabled={disabled}
          className="flex-1 min-w-0 h-11 border border-white/15 rounded-xl px-3 text-sm font-black text-white text-center focus:outline-none focus:border-primary/70 focus:shadow-[0_0_14px_rgba(139,92,246,0.3)] disabled:opacity-40 transition-all duration-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none cursor-pointer"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />

        {/* Plus */}
        <button
          type="button"
          onClick={increment}
          disabled={disabled}
          className="w-11 h-11 flex-shrink-0 rounded-xl border border-primary/35 hover:border-primary/60 hover:bg-primary/20 active:scale-90 disabled:opacity-30 transition-all duration-150 touch-manipulation flex items-center justify-center"
          style={{ background: 'rgba(139,92,246,0.12)' }}
          aria-label="Artır"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" className="text-primary">
            <rect x="3" y="7.25" width="10" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="7.25" y="3" width="1.5" height="10" rx="0.75" fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Preset drawer — açılır/kapanır, inline (overflow sorununu önler) */}
      {open && !disabled && (
        <div className="mt-2 rounded-2xl border border-white/12 p-2.5 animate-slide-up"
          style={{ background: 'rgba(17,28,48,0.95)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-text-3 font-bold uppercase tracking-widest">Hızlı Seç</span>
            <div className="flex gap-1">
              {[0.5, 2].map(mult => (
                <button
                  key={mult}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onChange(String(Math.max(1, Math.floor(num * mult)))); }}
                  className="text-[8px] font-black px-2 py-0.5 rounded-full border border-primary/30 text-primary/80 hover:bg-primary/15 transition"
                  style={{ background: 'rgba(139,92,246,0.08)' }}
                >
                  {mult === 0.5 ? '½' : '×2'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {ps.map(v => (
              <button
                key={v}
                type="button"
                onMouseDown={e => { e.preventDefault(); onChange(String(v)); setOpen(false); }}
                className={`py-2 rounded-xl text-xs font-black transition-all duration-100 touch-manipulation active:scale-95
                  ${num === v
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'border border-white/10 text-text-2 hover:border-primary/40 hover:text-primary'
                  }`}
                style={num !== v ? { background: 'rgba(255,255,255,0.04)' } : {}}
              >
                ₺{v >= 1000 ? `${v / 1000}K` : v}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
