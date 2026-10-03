import { useCallback, useEffect, useState } from 'react';
import api from '../../../services/api';
import { useToastStore } from '../../../store/toastStore';
import { useTranslation } from '../../../i18n';
import { useFormatters } from '../../../i18n/useFormatters.jsx';
import { formatMoney } from '../../../utils/money';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell, AdminPager } from '../../../components/admin/AdminTable.jsx';
import DetailDrawer from '../../../components/admin/DetailDrawer.jsx';
import ConfirmButton from './ConfirmButton.jsx';
import { promoErrorMessage } from './promoErrors.js';

const REFRESH_MS = 15000;
const STATUSES = ['pending', 'running', 'active', 'completed', 'cancelled', 'expired', 'failed'];
const STATUS_CLASS = {
  pending: 'bg-white/10 text-text-2',
  running: 'bg-info/15 text-info',
  active: 'bg-info/15 text-info',
  completed: 'bg-success/15 text-success',
  cancelled: 'bg-white/10 text-text-3 line-through',
  expired: 'bg-white/5 text-text-3 opacity-70',
  failed: 'bg-danger/15 text-danger',
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function StatusBadge({ status }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block rounded-full px-2 py-[3px] text-[11px] font-bold ${STATUS_CLASS[status] || STATUS_CLASS.pending}`}>
      {t(`admin.casinoPromo.status${cap(status)}`)}
    </span>
  );
}

export default function GrantsTable({ initialUser, refreshKey }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const addToast = useToastStore(s => s.add);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [username, setUsername] = useState(initialUser || '');
  const [debounced, setDebounced] = useState(initialUser || '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(username.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [username]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (kind) params.kind = kind;
      if (status) params.status = status;
      if (debounced) params.username = debounced;
      const r = await api.get('/admin/igames/promo/grants', { params });
      setData(r.data);
    } catch { /* sessiz: bir sonraki yenilemede tekrar denenir */ } finally {
      setLoading(false);
    }
  }, [kind, status, debounced, page]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // 15 sn'de bir yenile; sekme gizliyken yenileme, çıkışta interval temizlenir.
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  async function cancel(g) {
    const path = g.kind === 'bonusCall' ? '/admin/igames/bonus/cancel' : '/admin/igames/freeround/cancel';
    try {
      await api.post(path, { grant_id: g._id });
      addToast(t('admin.casinoPromo.cancelled'), 'success');
    } catch (e) {
      addToast(promoErrorMessage(e, t), 'error');
    }
    load();
  }

  const sel = 'rounded-lg border border-white/10 bg-bg-deep px-2 py-1.5 text-xs text-text-1 focus:outline-none';
  const cols = [
    { key: 'time', label: t('admin.casinoPromo.colTime') },
    { key: 'player', label: t('admin.casinoPromo.colPlayer') },
    { key: 'game', label: t('admin.casinoPromo.colGame') },
    { key: 'kind', label: t('admin.casinoPromo.colKind') },
    { key: 'amount', label: t('admin.casinoPromo.colAmount'), align: 'right' },
    { key: 'win', label: t('admin.casinoPromo.colWin'), align: 'right' },
    { key: 'status', label: t('admin.casinoPromo.colStatus') },
    { key: 'by', label: t('admin.casinoPromo.colBy') },
    { key: 'actions', label: t('common.actions') },
  ];

  function canCancel(g) {
    return g.status === 'running' || (g.status === 'active' && g.kind === 'freeRound' && !!g.frId);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={kind} onChange={e => { setKind(e.target.value); setPage(1); }} className={sel} aria-label={t('admin.casinoPromo.colKind')}>
          <option value="">{t('admin.casinoPromo.filterAllKinds')}</option>
          <option value="bonusCall">{t('admin.casinoPromo.kindBonusCall')}</option>
          <option value="freeRound">{t('admin.casinoPromo.kindFreeRound')}</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className={sel} aria-label={t('admin.casinoPromo.colStatus')}>
          <option value="">{t('admin.casinoPromo.filterAllStatuses')}</option>
          {STATUSES.map(s => <option key={s} value={s}>{t(`admin.casinoPromo.status${cap(s)}`)}</option>)}
        </select>
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder={t('admin.casinoPromo.filterPlayer')}
          className={`${sel} min-w-[8rem] flex-1`} />
        {loading && <span className="material-symbols-outlined animate-spin !text-[16px] text-text-3" aria-hidden="true">progress_activity</span>}
      </div>

      <AdminTable columns={cols} loading={loading && data.items.length === 0} empty={data.items.length === 0} emptyLabel={t('admin.casinoPromo.noGrants')}>
        {data.items.map(g => (
          <AdminTableRow key={g._id} className="cursor-pointer" dimmed={g.status === 'expired'}>
            <AdminTableCell className="whitespace-nowrap text-xs text-text-3"><span onClick={() => setDetail(g)}>{fmt.formatDateTime(g.createdAt)}</span></AdminTableCell>
            <AdminTableCell className="font-bold text-text-1"><span onClick={() => setDetail(g)}>{g.username}</span></AdminTableCell>
            <AdminTableCell className="text-text-2"><span onClick={() => setDetail(g)}>{g.gameName || '—'}</span></AdminTableCell>
            <AdminTableCell className="text-xs text-text-2">{g.kind === 'bonusCall' ? t('admin.casinoPromo.kindBonusCall') : t('admin.casinoPromo.kindFreeRound')}</AdminTableCell>
            <AdminTableCell align="right" className="whitespace-nowrap font-mono text-xs tabular-nums">
              {g.kind === 'bonusCall' ? formatMoney(g.setPoint) : `${g.rounds} × ${formatMoney(g.bet)}`}
            </AdminTableCell>
            <AdminTableCell align="right" className="whitespace-nowrap font-mono text-xs tabular-nums">
              {g.winTotal == null
                ? <span title={t('admin.casinoPromo.winUnknownTip')} className="text-text-3">—</span>
                : formatMoney(g.winTotal)}
            </AdminTableCell>
            <AdminTableCell><StatusBadge status={g.status} /></AdminTableCell>
            <AdminTableCell className="text-xs text-text-3">{g.grantedByUsername || '—'}</AdminTableCell>
            <AdminTableActionsCell>
              {canCancel(g) ? (
                <ConfirmButton icon="block" label={t('common.cancel')} confirmLabel={t('admin.casinoPromo.confirm')}
                  onConfirm={() => cancel(g)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger" />
              ) : g.status === 'active' && g.kind === 'freeRound' ? (
                <span className="text-[11px] text-text-3" title={t('admin.casinoPromo.cancelNoId')}>
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">info</span>
                </span>
              ) : null}
            </AdminTableActionsCell>
          </AdminTableRow>
        ))}
      </AdminTable>

      <AdminPager page={page} pages={data.pages} onPage={setPage} />

      <DetailDrawer open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `${detail.username} · ${detail.gameName || ''}` : ''}
        subtitle={detail ? (detail.kind === 'bonusCall' ? t('admin.casinoPromo.kindBonusCall') : t('admin.casinoPromo.kindFreeRound')) : ''}>
        {detail && <GrantDetail g={detail} />}
      </DetailDrawer>
    </div>
  );
}

function GrantDetail({ g }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const rows = [
    ['colStatus', <StatusBadge key="s" status={g.status} />],
    ['colBy', g.grantedByUsername],
    ['colTime', fmt.formatDateTime(g.createdAt)],
    ['fieldProvider', g.providerName || g.providerId],
    ['fieldGameCode', g.gameCode],
    ['memoLabel', g.memo],
    ...(g.kind === 'bonusCall' ? [
      ['fieldGplay', g.gplayId], ['fieldCallId', g.callId], ['amountLabel', formatMoney(g.setPoint)],
      ['colWin', g.winTotal == null ? null : formatMoney(g.winTotal)],
    ] : [
      ['fieldFrId', g.frId], ['roundsLabel', g.rounds], ['betLabel', formatMoney(g.bet)],
      ['winLabel', g.win], ['scenarioLabel', g.scenario],
      ['expiresLabel', g.expiresAt ? fmt.formatDateTime(g.expiresAt) : null],
    ]),
    ['fieldCompleted', g.completedAt ? fmt.formatDateTime(g.completedAt) : null],
    ['fieldCancelled', g.cancelledAt ? fmt.formatDateTime(g.cancelledAt) : null],
  ];
  return (
    <>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-text-3">{t(`admin.casinoPromo.${k}`)}</dt>
            <dd className="min-w-0 break-words text-right font-bold text-text-1">{v == null || v === '' ? '—' : v}</dd>
          </div>
        ))}
      </dl>
      {g.error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          <div className="mb-1 font-bold">{t('admin.casinoPromo.fieldError')}</div>
          {g.error.code}: {g.error.message}
        </div>
      )}
      <div>
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.casinoPromo.fieldResponse')}</div>
        <pre className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-bg-deep p-3 text-[11px] text-text-2">
          {JSON.stringify(g.providerResponse, null, 2)}
        </pre>
      </div>
    </>
  );
}
