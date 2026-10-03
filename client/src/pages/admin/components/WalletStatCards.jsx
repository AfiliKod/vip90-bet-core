import { useTranslation } from '../../../i18n';
import { formatMoney } from '../../../utils/money.js';

/**
 * Wallet sekmeleri (Bank / Crypto / Slikair) için ortak 4'lü özet kartı:
 * toplam yatırma, toplam çekim, net, kayıt sayısı. Veri yüklenene kadar
 * (`stats` null) hiçbir şey çizmez.
 *
 * @param {{ stats: { deposits: number, payouts: number, net: number, count: number } | null }} props
 */
export default function WalletStatCards({ stats }) {
  const { t, locale } = useTranslation();
  if (!stats) return null;

  const items = [
    { label: t('admin.wallet.statDeposits'), value: formatMoney(stats.deposits), tone: 'text-text-1' },
    { label: t('admin.wallet.statPayouts'), value: formatMoney(stats.payouts), tone: 'text-text-1' },
    { label: t('admin.wallet.statNet'), value: formatMoney(stats.net), tone: stats.net >= 0 ? 'text-success' : 'text-danger' },
    { label: t('admin.wallet.statCount'), value: Number(stats.count || 0).toLocaleString(locale), tone: 'text-text-1' },
  ];

  return (
    <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map(k => (
        <article key={k.label} className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{k.label}</div>
          <div className={`mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight ${k.tone}`}>
            {k.value}
          </div>
        </article>
      ))}
    </section>
  );
}
