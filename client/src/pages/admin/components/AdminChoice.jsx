// Admin ayar ekranlarının ortak küçük parçaları (Modules + ürün sayfaları).
export function Chip({ children, tone = 'default' }) {
  const cls = tone === 'default'
    ? 'bg-white/5 border-white/10 text-text-2'
    : 'bg-primary/15 border-primary/30 text-primary';
  return <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{children}</span>;
}

export function MultiCheck({ options, selected, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const active = selected.includes(opt.code ?? opt.id);
        const key = opt.code ?? opt.id;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition disabled:opacity-40 ${
              active
                ? 'bg-primary/20 border-primary/40 text-primary'
                : 'bg-white/5 border-white/10 text-text-3 hover:border-white/20'
            }`}
          >
            {opt.flag ? `${opt.flag} ` : ''}{opt.label}
          </button>
        );
      })}
    </div>
  );
}
