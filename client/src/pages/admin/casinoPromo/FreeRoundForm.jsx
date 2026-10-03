import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { formatMoney } from '../../../utils/money';
import { ADMIN_BTN_PRIMARY } from '../../../components/admin/AdminPageHeader.jsx';
import ConfirmButton from './ConfirmButton.jsx';
import { promoErrorMessage } from './promoErrors.js';

const MAX_ROUNDS = 500; // sunucu: services/casinoPromo/limits.js

function toLocalInput(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}
const defaultExpiry = () => toLocalInput(new Date(Date.now() + 7 * 86400000));

export default function FreeRoundForm({ initialUser, onDone }) {
  const { t } = useTranslation();
  const addToast = useToastStore(s => s.add);
  const [playerQuery, setPlayerQuery] = useState(initialUser || '');
  const [playerResults, setPlayerResults] = useState([]);
  const [player, setPlayer] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [providerNames, setProviderNames] = useState({});
  const [gameQuery, setGameQuery] = useState('');
  const [game, setGame] = useState(null);
  const [rounds, setRounds] = useState('10');
  const [bet, setBet] = useState('');
  const [expires, setExpires] = useState(defaultExpiry);
  const [showAdv, setShowAdv] = useState(false);
  const [win, setWin] = useState('0');
  const [scenario, setScenario] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const autoPicked = useRef(false);

  // Oyuncu araması (debounce 300 ms, ilk 8 sonuç). initialUser ile gelindiyse tam eşleşme otomatik seçilir.
  useEffect(() => {
    if (player && playerQuery === player.username) return undefined;
    const q = playerQuery.trim();
    if (!q) { setPlayerResults([]); return undefined; }
    const id = setTimeout(() => {
      api.get(`/admin/users?search=${encodeURIComponent(q)}&limit=8`)
        .then(r => {
          const users = (r.data.users || []).slice(0, 8);
          setPlayerResults(users);
          if (initialUser && !autoPicked.current && q === initialUser) {
            autoPicked.current = true;
            const match = users.find(u => u.username === initialUser);
            if (match) pickPlayer(match);
          }
        })
        .catch(() => setPlayerResults([]));
    }, 300);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerQuery]);

  function pickPlayer(u) {
    setPlayer({ id: u._id || u.id, username: u.username });
    setPlayerQuery(u.username);
    setPlayerResults([]);
  }

  // Katalog bir kez yüklenir; filtre istemci tarafında.
  useEffect(() => {
    api.post('/igames/game/all', { lang: 'tr' })
      .then(r => setCatalog((Array.isArray(r.data?.data) ? r.data.data : []).filter(g => g.provider_id !== 'inhouse')))
      .catch(() => setCatalog([]));
    api.post('/igames/providers', { lang: 'tr' })
      .then(r => {
        const list = Array.isArray(r.data?.data) ? r.data.data : [];
        setProviderNames(Object.fromEntries(list.map(p => [p.provider_id, p.provider_name])));
      })
      .catch(() => {});
  }, []);

  const gameResults = useMemo(() => {
    const q = gameQuery.trim().toLowerCase();
    if (!q || (game && gameQuery === game.name)) return [];
    return catalog.filter(g => {
      const name = String(g.game_name || g.name || '').toLowerCase();
      const code = String(g.game_symbol || g.game_code || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    }).slice(0, 20);
  }, [catalog, gameQuery, game]);

  function pickGame(g) {
    const name = g.game_name || g.name || g.game_symbol || g.game_code;
    setGame({
      code: g.game_symbol || g.game_code, name, providerId: g.provider_id,
      providerName: providerNames[g.provider_id] || String(g.provider_id),
    });
    setGameQuery(name);
  }

  const nRounds = Number(rounds);
  const nBet = Number(bet);
  const expiresMs = new Date(expires).getTime();
  const valid = player && game && Number.isInteger(nRounds) && nRounds >= 1 && nRounds <= MAX_ROUNDS
    && nBet > 0 && Number.isFinite(expiresMs) && expiresMs > Date.now() && Number(win) >= 0;

  async function submit() {
    if (!valid) return;
    setBusy(true);
    try {
      await api.post('/admin/igames/freeround/create', {
        user_id: player.id, provider_id: Number(game.providerId), game_code: game.code, game_name: game.name,
        rounds: nRounds, bet: nBet, win: Number(win) || 0,
        scenario: scenario === '' ? undefined : Number(scenario),
        expires_at: new Date(expires).toISOString(), memo: memo || undefined,
      });
      addToast(t('admin.casinoPromo.freeroundCreated'), 'success');
      setGame(null); setGameQuery(''); setBet(''); setMemo('');
    } catch (e) {
      addToast(promoErrorMessage(e, t), 'error');
    } finally {
      setBusy(false);
      onDone();
    }
  }

  const input = 'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none';
  const label = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3';
  const dropdown = 'absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-white/10 bg-bg-card shadow-xl';

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className={label}>{t('admin.casinoPromo.playerLabel')}</label>
        <input value={playerQuery} placeholder={t('admin.casinoPromo.playerSearch')}
          onChange={e => { setPlayerQuery(e.target.value); setPlayer(null); }} className={input} />
        {!player && playerResults.length > 0 && (
          <div className={dropdown}>
            {playerResults.map(u => (
              <button key={u._id || u.id} type="button" onClick={() => pickPlayer(u)}
                className="block w-full px-3 py-2 text-left text-sm text-text-1 hover:bg-bg-hover">
                {u.username}<span className="ml-2 text-xs text-text-3">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <label className={label}>{t('admin.casinoPromo.gameLabel')}</label>
        <input value={gameQuery} placeholder={t('admin.casinoPromo.gameSearch')}
          onChange={e => { setGameQuery(e.target.value); setGame(null); }} className={input} />
        {!game && gameResults.length > 0 && (
          <div className={dropdown}>
            {gameResults.map(g => (
              <button key={`${g.provider_id}-${g.game_symbol || g.game_code}`} type="button" onClick={() => pickGame(g)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-text-1 hover:bg-bg-hover">
                <span className="truncate">{g.game_name || g.name}</span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-px text-[10px] font-bold text-text-2">
                  {providerNames[g.provider_id] || g.provider_id}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>{t('admin.casinoPromo.roundsLabel')}</label>
          <input type="number" min="1" max={MAX_ROUNDS} value={rounds} onChange={e => setRounds(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>{t('admin.casinoPromo.betLabel')}</label>
          <input type="number" min="0" step="any" value={bet} onChange={e => setBet(e.target.value)} className={input} />
        </div>
        <div>
          <label className={label}>{t('admin.casinoPromo.expiresLabel')}</label>
          <input type="datetime-local" value={expires} onChange={e => setExpires(e.target.value)} className={input} />
        </div>
      </div>

      <button type="button" onClick={() => setShowAdv(v => !v)}
        className="inline-flex items-center gap-1 text-xs font-bold text-text-2 hover:text-text-1" aria-expanded={showAdv}>
        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{showAdv ? 'expand_less' : 'expand_more'}</span>
        {t('admin.casinoPromo.advanced')}
      </button>
      {showAdv && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>{t('admin.casinoPromo.winLabel')}</label>
            <input type="number" min="0" step="any" value={win} onChange={e => setWin(e.target.value)} className={input} />
            <p className="mt-1 text-[11px] text-text-3">{t('admin.casinoPromo.winHelp')}</p>
          </div>
          <div>
            <label className={label}>{t('admin.casinoPromo.scenarioLabel')}</label>
            <input type="number" step="1" value={scenario} onChange={e => setScenario(e.target.value)} className={input} />
          </div>
        </div>
      )}

      <div>
        <label className={label}>{t('admin.casinoPromo.memoLabel')}</label>
        <input value={memo} maxLength={200} onChange={e => setMemo(e.target.value)} className={input} />
      </div>

      {nRounds > 0 && nBet > 0 && (
        <div className="text-xs font-bold text-text-2">
          {t('admin.casinoPromo.summary', { rounds: nRounds, bet: formatMoney(nBet), total: formatMoney(nRounds * nBet) })}
        </div>
      )}

      <ConfirmButton
        icon="redeem"
        label={busy ? t('common.saving') : t('admin.casinoPromo.startFreeround')}
        confirmLabel={t('admin.casinoPromo.confirm')}
        confirmText={valid ? t('admin.casinoPromo.confirmFreeround', { user: player.username, game: game.name, rounds: nRounds, bet: formatMoney(nBet) }) : ''}
        onConfirm={submit}
        disabled={busy || !valid}
        className={ADMIN_BTN_PRIMARY}
      />
    </div>
  );
}
