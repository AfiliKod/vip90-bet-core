import { useState, useEffect } from 'react';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import api from '../../services/api';
import { useToastStore } from '../../store/toastStore';
import { useTranslation } from '../../i18n';
import { formatMoney } from '../../utils/money.js';
import WalletStatCards from './components/WalletStatCards.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

export default function AdminBankRequests() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [requests, setRequests] = useState([]);
  const [type, setType] = useState('deposit');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const addToast = useToastStore(s => s.add);

  const load = (typ) => {
    setLoading(true);
    api.get(`/bank/admin/pending?type=${typ}`)
      .then(r => setRequests(r.data.requests))
      .catch(() => {})
      .finally(() => setLoading(false));
    api.get('/admin/bank/stats')
      .then(r => setStats({ deposits: r.data.deposits.total, payouts: r.data.payouts.total, net: r.data.net, count: r.data.count }))
      .catch(() => {});
  };

  useEffect(() => { load(type); }, [type]);

  const approve = async (id) => {
    try {
      await api.patch(`/bank/admin/pending/${id}/approve`);
      addToast(t('admin.bankRequests.approved'), 'success');
      load(type);
    } catch (e) { addToast(e.response?.data?.error || t('common.error'), 'error'); }
  };

  const reject = async (id) => {
    const note = prompt(t('admin.bankRequests.rejectReasonPrompt'));
    try {
      await api.patch(`/bank/admin/pending/${id}/reject`, { note: note || '' });
      addToast(t('admin.bankRequests.rejected'), 'info');
      load(type);
    } catch (e) { addToast(e.response?.data?.error || t('common.error'), 'error'); }
  };

  const TABS = [
    { key: 'deposit', icon: 'arrow_downward', label: t('admin.bankRequests.depositRequests') },
    { key: 'withdraw', icon: 'arrow_upward', label: t('admin.bankRequests.withdrawRequests') },
  ];

  return (
    <>
      <WalletStatCards stats={stats} />

      <div className="flex gap-1 bg-bg-card border border-white/10 rounded-lg p-1 w-fit max-w-full overflow-x-auto mb-4">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setType(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition inline-flex items-center gap-1.5 ${type === tab.key ? 'bg-accent text-white' : 'text-text-3 hover:text-text-1'}`}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <AdminTable
        loading={loading}
        empty={requests.length === 0}
        emptyLabel={t('admin.bankRequests.noneWaiting')}
        columns={[
          { key: 'user', label: t('admin.bankRequests.columnUser') },
          { key: 'amount', label: t('admin.bankRequests.columnAmount'), align: 'right' },
          { key: 'date', label: t('admin.bankRequests.columnDate') },
          { key: 'actions', label: t('admin.bankRequests.columnActions'), align: 'right' },
        ]}
      >
        {requests.map(r => {
          const name = r.userId?.username || '???';
          const initials = name.slice(0, 2).toUpperCase();
          return (
            <AdminTableRow key={r._id}>
              <AdminTableCell>
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-bg-hover text-[11px] font-extrabold text-text-2">
                    {initials}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-text-1">{name}</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-text-3">{r.userId?.email || '—'}</div>
                  </div>
                </div>
              </AdminTableCell>
              <AdminTableCell align="right">
                <span className="font-mono font-semibold tabular-nums text-primary">{formatMoney(r.amount)}</span>
              </AdminTableCell>
              <AdminTableCell>
                <span className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(r.createdAt)}</span>
              </AdminTableCell>
              <AdminTableActionsCell>
                <RowActions
                  label={t('admin.bankRequests.columnActions')}
                  items={[
                    { key: 'approve', label: t('admin.bankRequests.approve'), icon: 'check', tone: 'success', onClick: () => approve(r._id) },
                    { key: 'reject', label: t('admin.bankRequests.reject'), icon: 'close', tone: 'danger', onClick: () => reject(r._id) },
                  ]}
                />
              </AdminTableActionsCell>
            </AdminTableRow>
          );
        })}
      </AdminTable>
    </>
  );
}
