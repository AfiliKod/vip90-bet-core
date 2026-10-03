// client/src/pages/admin/components/ActivityFeed.jsx
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { socket } from '../../../services/socket'; // doğrulandı: authStore.js'in kullandığı named export, ../services/socket.js

// İkonlar dile bağlı değil; etiketler i18n'den geçer (bkz. admin.activityFeed.type.*).
// Her türün kendi ikonu ve rengi var — liste, satırdaki tür adını yazmak yerine
// renkli ikon karosuyla okunur (tür adı ikincil satırda ve filtre menüsünde
// kalır). Sınıflar Tailwind'in tarayabilmesi için tam yazılmış olmalı
// (string birleştirme yok).
// İkonlar Material Symbols glyph adıdır (Faz 9) — render .material-symbols-outlined ile çizilir.
const TYPE_META = {
  deposit:       { icon: 'payments',      tone: 'text-emerald-400', tile: 'bg-emerald-400/10 border-emerald-400/20' },
  withdraw:      { icon: 'arrow_upward',  tone: 'text-amber-400',   tile: 'bg-amber-400/10 border-amber-400/20' },
  bet_placed:    { icon: 'target',        tone: 'text-sky-400',     tile: 'bg-sky-400/10 border-sky-400/20' },
  bet_settled:   { icon: 'flag',          tone: 'text-violet-400',  tile: 'bg-violet-400/10 border-violet-400/20' },
  game_session:  { icon: 'casino',        tone: 'text-fuchsia-400', tile: 'bg-fuchsia-400/10 border-fuchsia-400/20' },
  kyc_submitted: { icon: 'badge',         tone: 'text-teal-400',    tile: 'bg-teal-400/10 border-teal-400/20' },
  login_risk:    { icon: 'warning',       tone: 'text-orange-400',  tile: 'bg-orange-400/10 border-orange-400/20' },
  risk_flag:     { icon: 'outlined_flag', tone: 'text-red-400',     tile: 'bg-red-400/10 border-red-400/20' },
};
// i18n key kuralı (core.js KEY_RE) alt çizgiye izin vermiyor — sunucudaki
// ActivityEvent.type değerleri (bet_placed, login_risk...) alt çizgili
// olduğu için doğrudan key segmenti yapılamaz, camelCase karşılığı gerekir
// (aksi halde assertValidKey throw eder — Slikair'de yaşanan bug'ın aynısı).
const TYPE_KEY_SEGMENT = {
  deposit: 'deposit',
  withdraw: 'withdraw',
  bet_placed: 'betPlaced',
  bet_settled: 'betSettled',
  game_session: 'gameSession',
  kyc_submitted: 'kycSubmitted',
  login_risk: 'loginRisk',
  risk_flag: 'riskFlag',
};
const ALL_TYPES = Object.keys(TYPE_META);
const FALLBACK_META = { icon: 'info', tone: 'text-text-3', tile: 'bg-white/5 border-white/10' };

// Dashboard'da bu kart iki satır boyunca sağda duruyor; 10 item liste
// yüksekliği dolduruyor, artan alan yerine liste kendi içinde kayıyor
// (sabit max-h yerine flex-1: kart kısalırsa veya uzarsa boşluk kalmıyor).
const FEED_LIMIT = 10;

const BET_STATUS_PILL = {
  won: 'bg-emerald-400/15 text-emerald-300',
  lost: 'bg-red-400/15 text-red-300',
  cancelled: 'bg-white/10 text-text-2',
};

// Denetim raporu bulgusu: ev.summary sunucuda sabit Türkçe üretiliyor,
// i18n ile gösterilemez. Bunun yerine type+data'dan yerelleştirilmiş bir
// metin üretiyoruz — sunucu tarafı değişmedi (summary hâlâ audit/log
// amaçlı yazılıyor), sadece EKRANDA gösterilen metin artık buradan geliyor.
// Tür adı satırda tekrar edilmez (ikon + ikincil satır taşıyor) — burada
// yalnızca olayın DEĞERİ var.
function renderValue(ev, t, fmt) {
  const money = () => `${fmt.formatNumber(ev.amount ?? 0)} ${ev.currency || ''}`.trim();
  switch (ev.type) {
    case 'deposit':
      return <span className="font-semibold text-emerald-300 tabular-nums">+{money()}</span>;
    case 'withdraw':
      return <span className="font-semibold text-amber-300 tabular-nums">−{money()}</span>;
    case 'bet_placed':
      return t('admin.activityFeed.row.betPlaced', { stake: fmt.formatNumber(ev.amount ?? 0), count: ev.data?.selectionCount ?? '?' });
    case 'bet_settled':
      return (
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${BET_STATUS_PILL[ev.status] || BET_STATUS_PILL.cancelled}`}>
          {t(`admin.activityFeed.betStatus.${ev.status}`)}
        </span>
      );
    case 'game_session':
      return t('admin.activityFeed.row.gameSession', {
        game: ev.data?.gameTitle || '?',
        bet: fmt.formatNumber(ev.data?.totalBet ?? ev.amount ?? 0),
      });
    case 'kyc_submitted':
      return t('admin.activityFeed.row.kycSubmitted', { count: ev.data?.docCount ?? 1 });
    case 'risk_flag': {
      const codes = Array.isArray(ev.data?.findings) ? ev.data.findings.map(f => f.code).join(', ') : '';
      return <span className="font-mono text-[12px] text-red-300">{codes}</span>;
    }
    default:
      // Bilinmeyen tür — sunucunun ham (Türkçe) metnine düş, boş göstermektense
      return ev.summary;
  }
}

// Bugünkü olaylar yalnızca saatle, daha eskiler yalnızca tarihle — tam
// damga title'da.
function shortStamp(value, fmt) {
  const d = new Date(value);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? fmt.formatTime(value) : fmt.formatDate(value);
}

export default function ActivityFeed() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [events, setEvents] = useState([]);
  const [activeTypes, setActiveTypes] = useState(ALL_TYPES);
  const [expandedId, setExpandedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // Filtre menüsü: dışarı tıklayınca ya da Esc ile kapanır
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e) => { if (!filterRef.current?.contains(e.target)) setFilterOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  const fetchInitial = useCallback(() => {
    setLoading(true);
    api.get('/admin/activity', { params: { limit: FEED_LIMIT } })
      .then(r => setEvents(r.data.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  useEffect(() => {
    const onNew = (event) => setEvents(prev => [event, ...prev].slice(0, FEED_LIMIT));
    const onUpdate = (event) => setEvents(prev => {
      const idx = prev.findIndex(e => e._id === event._id);
      if (idx === -1) return [event, ...prev].slice(0, FEED_LIMIT);
      const next = [...prev];
      next[idx] = event;
      return next;
    });
    socket.on('activity:new', onNew);
    socket.on('activity:update', onUpdate);
    return () => {
      socket.off('activity:new', onNew);
      socket.off('activity:update', onUpdate);
    };
  }, []);

  const toggleType = (type) => {
    setActiveTypes(prev => prev.includes(type) ? prev.filter(t2 => t2 !== type) : [...prev, type]);
  };

  const filtered = events.filter(e => activeTypes.includes(e.type));

  return (
    <div className="flex h-full flex-col bg-bg-card border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold text-text-1 shrink-0">{t('admin.activityFeed.title')}</h3>
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            aria-expanded={filterOpen} aria-haspopup="true"
            className="flex items-center gap-1 text-xs text-text-2 hover:text-text-1 transition"
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">filter_list</span>
            {t('admin.activityFeed.filter')}
            <span className="text-text-3 tabular-nums">{activeTypes.length}/{ALL_TYPES.length}</span>
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-20 w-52 rounded-lg bg-bg-hover border border-white/10 shadow-xl py-1 animate-fade-in" role="menu">
              {ALL_TYPES.map(type => {
                const meta = TYPE_META[type];
                const on = activeTypes.includes(type);
                return (
                  <button key={type} onClick={() => toggleType(type)}
                    role="menuitemcheckbox" aria-checked={on}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-white/5 transition">
                    <span className={`material-symbols-outlined !text-[16px] ${on ? meta.tone : 'text-text-3'}`} aria-hidden="true">{meta.icon}</span>
                    <span className={`flex-1 ${on ? 'text-text-1' : 'text-text-3'}`}>{t(`admin.activityFeed.type.${TYPE_KEY_SEGMENT[type]}`)}</span>
                    <span className={`material-symbols-outlined !text-[16px] ${on ? 'text-primary' : 'text-transparent'}`} aria-hidden="true">check</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div className="text-text-3 text-sm text-center py-4">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-text-3 text-sm text-center py-4">{t('admin.activityFeed.empty')}</div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {filtered.map(ev => {
            const meta = TYPE_META[ev.type] || FALLBACK_META;
            const typeLabel = TYPE_KEY_SEGMENT[ev.type] ? t(`admin.activityFeed.type.${TYPE_KEY_SEGMENT[ev.type]}`) : ev.type;
            return (
              <div key={ev._id} className="rounded-lg bg-white/[0.02] border border-white/5">
                <button
                  onClick={() => setExpandedId(expandedId === ev._id ? null : ev._id)}
                  className="w-full flex items-center gap-3 px-2.5 py-2 text-left hover:bg-bg-hover transition rounded-lg"
                >
                  <span className={`w-9 h-9 shrink-0 rounded-lg border flex items-center justify-center ${meta.tile}`}>
                    <span className={`material-symbols-outlined !text-[18px] ${meta.tone}`} aria-hidden="true">{meta.icon}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-text-1 truncate">{renderValue(ev, t, fmt)}</span>
                    <span className="block text-[11px] text-text-3 truncate">
                      {ev.userId?.username ? `${ev.userId.username} · ${typeLabel}` : typeLabel}
                    </span>
                  </span>
                  <time dateTime={ev.createdAt} title={fmt.formatDateTime(ev.createdAt)} className="text-[11px] text-text-3 tabular-nums shrink-0">
                    {shortStamp(ev.createdAt, fmt)}
                  </time>
                </button>
                {expandedId === ev._id && (
                  <div className="px-3 pb-3 text-xs text-text-3 space-y-1">
                    <div>{t('admin.activityFeed.status')}: {ev.status}</div>
                    {ev.amount != null && <div>{t('admin.activityFeed.amount')}: {ev.amount} {ev.currency || ''}</div>}
                    {ev.data && Object.keys(ev.data).length > 0 && (
                      <pre className="bg-bg-hover rounded p-2 overflow-x-auto">{JSON.stringify(ev.data, null, 2)}</pre>
                    )}
                    {ev.userId?.username && (
                      <Link to={`/admin/users?openUser=${encodeURIComponent(ev.userId.username)}`} className="text-primary hover:underline inline-block mt-1">
                        {t('admin.activityFeed.viewUser')} ({ev.userId.username})
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
