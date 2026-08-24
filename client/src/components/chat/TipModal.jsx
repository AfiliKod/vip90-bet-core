import { useState } from 'react';
import { useTranslation } from '../../i18n';

const QUICK_AMOUNTS = [10, 25, 50, 100];

export default function TipModal({ isOpen, toUsername, onSend, onClose }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const numericAmount = Number(amount);
  const canSend = Number.isFinite(numericAmount) && numericAmount > 0;

  function reset() {
    setAmount('');
    setNote('');
  }

  function handleClose() {
    reset();
    onClose && onClose();
  }

  function handleSend() {
    if (!canSend || !onSend) return;
    onSend(numericAmount, note.trim());
    reset();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-void/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-bg-card border border-white/10 p-4 animate-balloon"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 className="text-base font-bold text-text-1 leading-snug">
            {t('tip.to', { username: toUsername })}
          </h2>
          <button
            onClick={handleClose}
            aria-label={t('tip.cancel')}
            className="shrink-0 w-7 h-7 rounded-lg text-text-3 hover:text-text-1 hover:bg-bg-hover flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        <label className="block text-xs font-medium text-text-2 mb-1.5">{t('tip.amount')}</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {QUICK_AMOUNTS.map(value => (
            <button
              key={value}
              onClick={() => setAmount(String(value))}
              className={`py-1.5 rounded-lg text-xs font-semibold border transition ${
                numericAmount === value
                  ? 'bg-primary/20 border-primary/40 text-text-1'
                  : 'border-white/10 text-text-2 hover:text-text-1 hover:bg-bg-hover'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder={t('tip.amount')}
          className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:border-accent/40 outline-none mb-3 transition"
        />

        <label className="block text-xs font-medium text-text-2 mb-1.5">
          {t('tip.message')}
        </label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={100}
          placeholder={t('tip.message')}
          className="w-full rounded-lg bg-bg-base border border-white/10 px-3 py-2 text-sm text-text-1 placeholder:text-text-3 focus:border-accent/40 outline-none transition"
        />

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={handleClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-text-2 border border-white/10 hover:text-text-1 hover:bg-bg-hover transition"
          >
            {t('tip.cancel')}
          </button>
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-1 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {t('tip.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
