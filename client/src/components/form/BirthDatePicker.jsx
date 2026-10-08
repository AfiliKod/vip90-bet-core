import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../i18n';

// Doğum tarihi için takvim yerine gün/ay/yıl dropdown'ları — yıl seçiminde
// takvimde 30-100 yıl geri kaydırmaktan çok daha hızlı, klavye/dokunmatik
// dostu. value: 'YYYY-MM-DD' string ya da '' (eksik/seçilmemiş).
const MIN_AGE_YEARS = 18;
const MAX_AGE_YEARS = 100;

function parseValue(value) {
  if (!value) return { y: '', m: '', d: '' };
  const [y, m, d] = value.split('-');
  const num = (v) => (v ? String(Number(v)) : '');
  return { y: num(y), m: num(m), d: num(d) };
}

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

export default function BirthDatePicker({ value, onChange, size = 'md', error }) {
  const { t, locale } = useTranslation();

  // Seçimler yerelde tutulur: üçü de seçilene kadar dışarıya '' gider, bu
  // yüzden değeri yalnızca prop'tan türetmek her kısmi seçimi sıfırlıyordu.
  // Option value'ları '5' gibi dolgusuz; '05' ile eşleşmesin diye sayıya çevrilir.
  const [parts, setParts] = useState(() => parseValue(value));
  useEffect(() => {
    // Dışarıdan sıfırlama (form reset) tam seçimi temizler; kısmi seçim zaten '' yayar, korunur.
    setParts(p => (value || (p.y && p.m && p.d) ? parseValue(value) : p));
  }, [value]);
  const { y: year, m: month, d: day } = parts;

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now - MIN_AGE_YEARS; y >= now - MAX_AGE_YEARS; y--) list.push(y);
    return list;
  }, []);

  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale || 'tr', { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: fmt.format(new Date(2000, i, 1)),
    }));
  }, [locale]);

  const dayCount = daysInMonth(Number(year), Number(month));
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const emit = (next) => {
    const merged = { ...parts, ...next };
    // Ay/yıl değişince eski gün yeni ayda yoksa (ör. 31 Şubat) en son güne düşür
    if (merged.d && merged.m) {
      const maxDay = daysInMonth(Number(merged.y) || 2000, Number(merged.m));
      if (Number(merged.d) > maxDay) merged.d = String(maxDay);
    }
    setParts(merged);
    const { y, m, d } = merged;
    onChange(y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '');
  };

  const selectClass = size === 'sm'
    ? 'bg-bg-hover border border-white/10 rounded-lg px-2 py-2 text-sm text-text-1 focus:outline-none focus:border-primary/50'
    : 'bg-bg-base border border-white/10 rounded-lg px-3 py-3 text-text-1 focus:outline-none focus:border-primary transition';

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <select value={day} onChange={e => emit({ d: e.target.value })} className={selectClass}>
          <option value="">{t('auth.birthDay')}</option>
          {days.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={month} onChange={e => emit({ m: e.target.value })} className={selectClass}>
          <option value="">{t('auth.birthMonth')}</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <select value={year} onChange={e => emit({ y: e.target.value })} className={selectClass}>
          <option value="">{t('auth.birthYear')}</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {error && <p className="text-danger text-xs mt-1">{error}</p>}
    </div>
  );
}
