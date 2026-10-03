import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import { useFormatters } from '../../i18n/useFormatters.jsx';
import { ADMIN_BTN, ADMIN_BTN_PRIMARY, AdminTabs } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminPager, AdminTableActionsCell } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';

const RISK_LEVEL_COLORS = {
  LOW: 'bg-success/15 text-success',
  MEDIUM: 'bg-warning/20 text-warning',
  HIGH: 'bg-gold/15 text-gold',
  CRITICAL: 'bg-danger/20 text-danger',
};

const RISK_STATUS_COLORS = {
  CLEAR: 'bg-success/15 text-success',
  REVIEW: 'bg-warning/20 text-warning',
  RESTRICTED: 'bg-gold/15 text-gold',
  BLOCKED: 'bg-danger/20 text-danger',
};

const SEVERITY_COLORS = {
  LOW: 'bg-info/15 text-info',
  MEDIUM: 'bg-warning/20 text-warning',
  HIGH: 'bg-gold/15 text-gold',
  CRITICAL: 'bg-danger/20 text-danger',
};

const NEUTRAL_BADGE = 'bg-white/10 text-text-3';

const BADGE_CLS = 'inline-flex items-center rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase';

const CHIP_CLS =
  'inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1 disabled:opacity-40';

const INPUT_CLS =
  'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none';

const LABEL_CLS = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3';

const MODAL_FOOTER_CLS = 'mt-6 flex justify-end gap-2 border-t border-white/10 pt-4';

function SectionHeader({ icon, title, count, action }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{icon}</span>
      </span>
      <h3 className="text-sm font-extrabold text-text-1">{title}</h3>
      {count != null && (
        <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">{count}</span>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

function StatCard({ icon, label, value, color = 'text-text-1' }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{label}</span>
        <span className="material-symbols-outlined !text-[16px] text-text-3/70" aria-hidden="true">{icon}</span>
      </div>
      <div className={`mt-2 font-mono text-[22px] font-bold tabular-nums tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function FindingModal({ finding, onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [resolution, setResolution] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">rule</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.risk.findingModal.title')}</h3>
        </div>
        <div className="mb-4 rounded-lg border border-white/5 bg-bg-deep px-3 py-2">
          <div className="text-sm font-bold text-text-1">{finding.code}</div>
          <div className="text-xs text-text-3">{finding.description}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`${BADGE_CLS} ${SEVERITY_COLORS[finding.severity] || NEUTRAL_BADGE}`}>{finding.severity}</span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-3">{finding.category}</span>
          </div>
        </div>
        <div className="mb-4">
          <label className={LABEL_CLS}>{t('admin.risk.findingModal.resolution')}</label>
          <textarea
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            rows={3}
            className={`${INPUT_CLS} resize-none`}
            placeholder={t('admin.risk.findingModal.resolutionPlaceholder')}
          />
        </div>
        <div className={MODAL_FOOTER_CLS}>
          <button onClick={onClose} className={ADMIN_BTN}>
            {t('admin.risk.findingModal.cancel')}
          </button>
          <button
            onClick={() => onConfirm(resolution)}
            disabled={loading || !resolution.trim()}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-success/30 bg-success/15 px-3 text-[13px] font-bold text-success transition hover:bg-success/25 disabled:opacity-40"
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">check</span>
            {loading ? t('common.saving') : t('admin.risk.findingModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function OverrideModal({ onClose, onConfirm, loading }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('BLOCKED');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">admin_panel_settings</span>
          </span>
          <h3 className="text-sm font-extrabold text-text-1">{t('admin.risk.overrideModal.title')}</h3>
        </div>
        <div className="space-y-3">
          <div>
            <label className={LABEL_CLS}>{t('admin.risk.overrideModal.status')}</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className={INPUT_CLS}
            >
              <option value="BLOCKED">{t('admin.risk.status.blocked')}</option>
              <option value="RESTRICTED">{t('admin.risk.status.restricted')}</option>
              <option value="REVIEW">{t('admin.risk.status.review')}</option>
              <option value="CLEAR">{t('admin.risk.status.clear')}</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>{t('admin.risk.overrideModal.reason')}</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className={`${INPUT_CLS} resize-none`}
              placeholder={t('admin.risk.overrideModal.reasonPlaceholder')}
            />
          </div>
        </div>
        <div className={MODAL_FOOTER_CLS}>
          <button onClick={onClose} className={ADMIN_BTN}>
            {t('admin.risk.overrideModal.cancel')}
          </button>
          <button
            onClick={() => onConfirm(status, reason)}
            disabled={loading || reason.trim().length < 3}
            className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
          >
            {loading ? t('common.saving') : t('admin.risk.overrideModal.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RiskDashboard() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerRisk, setPlayerRisk] = useState(null);
  const [playerSearchLoading, setPlayerSearchLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ name: '', category: 'deposit', conditions: [{ field: '', operator: 'gte', value: '' }], action: 'REVIEW', severity: 'MEDIUM', reasonCode: '', description: '' });
  const [notice, setNotice] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [findingModal, setFindingModal] = useState(null);
  const [overrideModal, setOverrideModal] = useState(null);
  const [rulePage, setRulePage] = useState(1);
  const [findingPage, setFindingPage] = useState(1);
  const [evalPage, setEvalPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/risk/dashboard');
      setDashboard(data);
    } catch {
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const { data } = await api.get('/admin/risk/rules');
      setRules(data.rules || []);
    } catch {
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (tab === 'rules') loadRules(); }, [tab, loadRules]);

  async function searchPlayer() {
    if (!playerSearch.trim()) return;
    setPlayerSearchLoading(true);
    setPlayerRisk(null);
    try {
      const { data } = await api.get(`/admin/risk/player/${playerSearch.trim()}`);
      setPlayerRisk(data);
      setFindingPage(1);
      setEvalPage(1);
    } catch {
      setPlayerRisk(null);
      setNotice({ type: 'error', text: t('admin.risk.notice.playerNotFound') });
    } finally {
      setPlayerSearchLoading(false);
    }
  }

  async function triggerEvaluation(playerId) {
    setActionLoading(`eval-${playerId}`);
    try {
      const { data } = await api.post(`/admin/risk/player/${playerId}/evaluate`, { event: 'manual_review' });
      setPlayerRisk(prev => prev ? { ...prev, profile: { ...prev.profile, riskLevel: data.riskLevel, riskScore: data.score, riskStatus: data.decision === 'ALLOW' ? 'CLEAR' : data.decision } } : prev);
      setNotice({ type: 'ok', text: `${t('admin.risk.notice.evaluated')}: ${data.decision} (${t('admin.risk.notice.score')}: ${data.score})` });
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.evalFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmOverride(status, reason) {
    if (!overrideModal) return;
    const playerId = overrideModal;
    setActionLoading(`override-${playerId}`);
    try {
      await api.post(`/admin/risk/player/${playerId}/override`, { status, reason });
      setNotice({ type: 'ok', text: t('admin.risk.notice.statusChanged', { status }) });
      setOverrideModal(null);
      searchPlayer();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.overrideFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmFindingResolve(resolution) {
    if (!findingModal) return;
    setActionLoading(`finding-${findingModal._id}`);
    try {
      await api.post(`/admin/risk/findings/${findingModal._id}/resolve`, { resolution });
      setNotice({ type: 'ok', text: t('admin.risk.notice.findingResolved') });
      setFindingModal(null);
      if (playerRisk?.profile?.playerId) searchPlayer();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.resolveFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  async function saveRule() {
    setActionLoading('save-rule');
    try {
      const payload = {
        ...ruleForm,
        conditions: ruleForm.conditions.map(c => ({ ...c, value: isNaN(c.value) ? c.value : Number(c.value) })),
      };
      if (editRule) {
        await api.put(`/admin/risk/rules/${editRule._id}`, payload);
        setNotice({ type: 'ok', text: t('admin.risk.notice.ruleUpdated') });
      } else {
        await api.post('/admin/risk/rules', payload);
        setNotice({ type: 'ok', text: t('admin.risk.notice.ruleCreated') });
      }
      setShowRuleModal(false);
      setEditRule(null);
      setRuleForm({ name: '', category: 'deposit', conditions: [{ field: '', operator: 'gte', value: '' }], action: 'REVIEW', severity: 'MEDIUM', reasonCode: '', description: '' });
      loadRules();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.saveFailed') });
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleRule(ruleId, enabled) {
    try {
      await api.patch(`/admin/risk/rules/${ruleId}/toggle`, { enabled });
      loadRules();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.toggleFailed') });
    }
  }

  async function deleteRule(ruleId) {
    if (!confirm(t('admin.risk.confirmDeleteRule'))) return;
    try {
      await api.delete(`/admin/risk/rules/${ruleId}`);
      setNotice({ type: 'ok', text: t('admin.risk.notice.ruleDeleted') });
      loadRules();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.risk.notice.deleteFailed') });
    }
  }

  const stats = dashboard?.riskStats;
  const signalStats = dashboard?.signalStats || [];
  const totalProfiles = stats?.statusStats?.reduce((s, r) => s + r.count, 0) || 0;
  const reviewCount = stats?.statusStats?.find(r => r._id === 'REVIEW')?.count || 0;
  const restrictedCount = stats?.statusStats?.find(r => r._id === 'RESTRICTED')?.count || 0;
  const blockedCount = stats?.statusStats?.find(r => r._id === 'BLOCKED')?.count || 0;

  const paginatedRules = rules.slice((rulePage - 1) * PAGE_SIZE, rulePage * PAGE_SIZE);
  const rulePages = Math.ceil(rules.length / PAGE_SIZE);

  const pFindings = playerRisk?.activeFindings || [];
  const paginatedFindings = pFindings.slice((findingPage - 1) * PAGE_SIZE, findingPage * PAGE_SIZE);
  const findingPages = Math.ceil(pFindings.length / PAGE_SIZE);

  const pEvals = playerRisk?.recentEvaluations || [];
  const paginatedEvals = pEvals.slice((evalPage - 1) * PAGE_SIZE, evalPage * PAGE_SIZE);
  const evalPages = Math.ceil(pEvals.length / PAGE_SIZE);

  const tabs = [
    { key: 'overview', label: t('admin.risk.tabs.overview') },
    { key: 'player', label: t('admin.risk.tabs.player') },
    { key: 'rules', label: t('admin.risk.tabs.rules') },
  ];

  return (
    // Dış sarmalayıcı yok: Compliance.jsx wrapper'ı tab içeriğini sarar
    <div>
      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok'
            ? 'border-success/30 bg-success/15 text-success'
            : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      <div className="mb-4">
        <AdminTabs items={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'overview' && (
        loading ? (
          <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-12 text-center text-sm text-text-3">{t('admin.risk.loading')}</div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard icon="person" label={t('admin.risk.stats.totalProfiles')} value={totalProfiles.toLocaleString(locale)} />
              <StatCard icon="warning" label={t('admin.risk.stats.reviewPending')} value={reviewCount.toLocaleString(locale)} color="text-warning" />
              <StatCard icon="block" label={t('admin.risk.stats.restricted')} value={restrictedCount.toLocaleString(locale)} color="text-gold" />
              <StatCard icon="cancel" label={t('admin.risk.stats.blocked')} value={blockedCount.toLocaleString(locale)} color="text-danger" />
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-white/10 bg-bg-card p-4">
                <SectionHeader icon="donut_small" title={t('admin.risk.overview.statusDistribution')} />
                {stats?.statusStats?.length > 0 ? (
                  <div className="space-y-2">
                    {stats.statusStats.map(s => (
                      <div key={s._id} className="flex items-center justify-between gap-2">
                        <span className={`${BADGE_CLS} ${RISK_STATUS_COLORS[s._id] || NEUTRAL_BADGE}`}>{t(`admin.risk.status.${String(s._id).toLowerCase()}`)}</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-text-2">{Number(s.count || 0).toLocaleString(locale)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/5 bg-bg-deep px-4 py-8 text-center">
                    <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">donut_small</span>
                    <div className="mt-2 text-sm text-text-3">{t('admin.risk.noData')}</div>
                  </div>
                )}
              </section>
              <section className="rounded-xl border border-white/10 bg-bg-card p-4">
                <SectionHeader icon="bar_chart" title={t('admin.risk.overview.evaluationDistribution')} />
                {stats?.evaluationStats?.length > 0 ? (
                  <div className="space-y-2">
                    {stats.evaluationStats.map(s => (
                      <div key={s._id} className="flex items-center justify-between gap-2">
                        <span className={`${BADGE_CLS} ${RISK_STATUS_COLORS[s._id] || NEUTRAL_BADGE}`}>{s._id}</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-text-2">{Number(s.count || 0).toLocaleString(locale)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-white/5 bg-bg-deep px-4 py-8 text-center">
                    <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">bar_chart</span>
                    <div className="mt-2 text-sm text-text-3">{t('admin.risk.noData')}</div>
                  </div>
                )}
              </section>
            </div>

            {signalStats.length > 0 && (
              <section className="mb-4">
                <div className="mb-3">
                  <SectionHeader icon="sensor_occupied" title={t('admin.risk.overview.signalStats')} count={signalStats.length.toLocaleString(locale)} />
                  <p className="text-xs text-text-3">{t('admin.risk.overview.signalStatsHint')}</p>
                </div>
                <AdminTable
                  columns={[
                    { key: 'category', label: t('admin.risk.signalStats.category') },
                    { key: 'severity', label: t('admin.risk.signalStats.severity') },
                    { key: 'count', label: t('admin.risk.signalStats.count'), align: 'right' },
                  ]}
                >
                  {signalStats.map((s, i) => (
                    <AdminTableRow key={i}>
                      <AdminTableCell>
                        <span className="text-xs capitalize text-text-2">{s._id?.category || '—'}</span>
                      </AdminTableCell>
                      <AdminTableCell>
                        <span className={`${BADGE_CLS} ${SEVERITY_COLORS[s._id?.severity] || NEUTRAL_BADGE}`}>
                          {s._id?.severity || '—'}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell align="right">
                        <span className="font-mono text-xs font-bold tabular-nums text-text-1">
                          {Number(s.count || 0).toLocaleString(locale)}
                        </span>
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTable>
              </section>
            )}
          </>
        )
      )}

      {tab === 'player' && (
        <div>
          {/* Filtreler */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
              <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
              <input
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchPlayer()}
                placeholder={t('admin.risk.playerSearch.placeholder')}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
              />
            </label>
            <button
              onClick={searchPlayer}
              disabled={playerSearchLoading || !playerSearch.trim()}
              className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
            >
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">search</span>
              {playerSearchLoading ? t('common.saving') : t('admin.risk.playerSearch.button')}
            </button>
            <button
              type="button"
              onClick={() => { setPlayerSearch(''); setPlayerRisk(null); }}
              className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
            >
              <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
              {t('common.reset')}
            </button>
          </div>

          {playerRisk && (
            <div className="space-y-4">
              <section className="rounded-xl border border-white/10 bg-bg-card p-4">
                <SectionHeader
                  icon="shield_person"
                  title={t('admin.risk.profile.title')}
                  action={(
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => triggerEvaluation(playerRisk.profile?.playerId)}
                        disabled={actionLoading === `eval-${playerRisk.profile?.playerId}`}
                        className={CHIP_CLS}
                      >
                        <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">refresh</span>
                        {actionLoading === `eval-${playerRisk.profile?.playerId}` ? t('common.saving') : t('admin.risk.profile.reEvaluate')}
                      </button>
                      <button
                        onClick={() => setOverrideModal(playerRisk.profile?.playerId)}
                        disabled={actionLoading === `override-${playerRisk.profile?.playerId}`}
                        className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
                      >
                        <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">tune</span>
                        {t('admin.risk.profile.manualOverride')}
                      </button>
                    </div>
                  )}
                />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.risk.profile.status')}</div>
                    <span className={`${BADGE_CLS} mt-1.5 ${RISK_STATUS_COLORS[playerRisk.profile?.riskStatus] || NEUTRAL_BADGE}`}>{t(`admin.risk.status.${String(playerRisk.profile?.riskStatus || 'CLEAR').toLowerCase()}`)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.risk.profile.level')}</div>
                    <span className={`${BADGE_CLS} mt-1.5 ${RISK_LEVEL_COLORS[playerRisk.profile?.riskLevel] || NEUTRAL_BADGE}`}>{playerRisk.profile?.riskLevel || 'LOW'}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.risk.profile.score')}</div>
                    <div className="mt-1 font-mono text-[22px] font-bold tabular-nums tracking-tight text-text-1">{Number(playerRisk.profile?.riskScore || 0).toLocaleString(locale)}</div>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.risk.profile.lastEvaluated')}</div>
                    <div className="mt-1.5 font-mono text-xs text-text-2">{playerRisk.profile?.lastEvaluatedAt ? fmt.formatDateTime(playerRisk.profile.lastEvaluatedAt) : '—'}</div>
                  </div>
                </div>
                {playerRisk.profile?.activeFlags?.length > 0 && (
                  <div className="mt-3 border-t border-white/10 pt-3">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.07em] text-text-3">{t('admin.risk.profile.activeFlags')}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {playerRisk.profile.activeFlags.map((f, i) => (
                        <span key={i} className={`${BADGE_CLS} bg-danger/20 text-danger`}>{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {pFindings.length > 0 && (
                <section>
                  <div className="mb-3">
                    <SectionHeader icon="find_in_page" title={t('admin.risk.findings.title', { count: pFindings.length.toLocaleString(locale) })} />
                  </div>
                  <AdminTable
                    columns={[
                      { key: 'severity', label: t('admin.risk.findings.severity') },
                      { key: 'code', label: t('admin.risk.findings.code') },
                      { key: 'description', label: t('admin.risk.findings.description') },
                      { key: 'actions', label: t('admin.risk.findings.actions'), align: 'right' },
                    ]}
                  >
                    {paginatedFindings.map(f => (
                      <AdminTableRow key={f._id}>
                        <AdminTableCell>
                          <span className={`${BADGE_CLS} ${SEVERITY_COLORS[f.severity] || NEUTRAL_BADGE}`}>{f.severity}</span>
                        </AdminTableCell>
                        <AdminTableCell>
                          <span className="font-mono text-xs font-bold text-text-1">{f.code}</span>
                        </AdminTableCell>
                        <AdminTableCell>
                          <span className="text-xs text-text-3">{f.description}</span>
                        </AdminTableCell>
                        <AdminTableActionsCell>
                          <button
                            type="button"
                            onClick={() => setFindingModal(f)}
                            disabled={actionLoading === `finding-${f._id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-success/30 bg-success/15 px-2.5 text-xs font-bold text-success transition hover:bg-success/25 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">task_alt</span>
                            {actionLoading === `finding-${f._id}` ? t('common.saving') : t('admin.risk.findings.resolve')}
                          </button>
                        </AdminTableActionsCell>
                      </AdminTableRow>
                    ))}
                  </AdminTable>
                  <AdminPager
                    page={findingPage}
                    pages={findingPages}
                    onPage={setFindingPage}
                    totalLabel={t('admin.risk.findings.countLine', {
                      count: pFindings.length.toLocaleString(locale),
                      page: findingPage,
                      pages: findingPages,
                    })}
                  />
                </section>
              )}

              {pEvals.length > 0 && (
                <section>
                  <div className="mb-3">
                    <SectionHeader icon="history" title={t('admin.risk.evaluations.title')} count={pEvals.length.toLocaleString(locale)} />
                  </div>
                  <AdminTable
                    columns={[
                      { key: 'date', label: t('admin.risk.evaluations.date') },
                      { key: 'event', label: t('admin.risk.evaluations.event') },
                      { key: 'decision', label: t('admin.risk.evaluations.decision') },
                      { key: 'score', label: t('admin.risk.evaluations.score'), align: 'right' },
                      { key: 'findings', label: t('admin.risk.evaluations.findings'), align: 'right' },
                    ]}
                  >
                    {paginatedEvals.map(ev => (
                      <AdminTableRow key={ev._id}>
                        <AdminTableCell>
                          <span className="whitespace-nowrap font-mono text-xs text-text-3">{fmt.formatDateTime(ev.createdAt)}</span>
                        </AdminTableCell>
                        <AdminTableCell><span className="text-xs text-text-2">{ev.event}</span></AdminTableCell>
                        <AdminTableCell>
                          <span className={`${BADGE_CLS} ${RISK_STATUS_COLORS[ev.decision] || NEUTRAL_BADGE}`}>{ev.decision}</span>
                        </AdminTableCell>
                        <AdminTableCell align="right">
                          <span className="font-mono text-xs font-bold text-text-1">{Number(ev.score || 0).toLocaleString(locale)}</span>
                        </AdminTableCell>
                        <AdminTableCell align="right">
                          <span className="font-mono text-xs text-text-3">{(ev.findings?.length || 0).toLocaleString(locale)}</span>
                        </AdminTableCell>
                      </AdminTableRow>
                    ))}
                  </AdminTable>
                  <AdminPager
                    page={evalPage}
                    pages={evalPages}
                    onPage={setEvalPage}
                    totalLabel={t('admin.risk.evaluations.countLine', {
                      count: pEvals.length.toLocaleString(locale),
                      page: evalPage,
                      pages: evalPages,
                    })}
                  />
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">receipt_long</span>
            </span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.risk.rules.title')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
              {rules.length.toLocaleString(locale)}
            </span>
            <button
              onClick={() => { setEditRule(null); setRuleForm({ name: '', category: 'deposit', conditions: [{ field: '', operator: 'gte', value: '' }], action: 'REVIEW', severity: 'MEDIUM', reasonCode: '', description: '' }); setShowRuleModal(true); }}
              className={`${ADMIN_BTN_PRIMARY} ml-auto`}
            >
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
              {t('admin.risk.rules.newRule')}
            </button>
          </div>

          {rulesLoading ? (
            <div className="rounded-xl border border-white/10 bg-bg-card px-4 py-8 text-center text-sm text-text-3">{t('admin.risk.loading')}</div>
          ) : (
            <>
              <AdminTable
                empty={paginatedRules.length === 0}
                emptyLabel={t('admin.risk.rules.noRules')}
                columns={[
                  { key: 'status', label: t('admin.risk.rules.status') },
                  { key: 'name', label: t('admin.risk.rules.name') },
                  { key: 'category', label: t('admin.risk.rules.category') },
                  { key: 'action', label: t('admin.risk.rules.action') },
                  { key: 'priority', label: t('admin.risk.rules.priority'), align: 'right' },
                  { key: 'actions', label: t('admin.risk.rules.operations'), align: 'right' },
                ]}
              >
                {paginatedRules.map(rule => (
                  <AdminTableRow key={rule._id}>
                    <AdminTableCell>
                      <button
                        onClick={() => toggleRule(rule._id, !rule.enabled)}
                        aria-label={t('admin.risk.rules.status')}
                        className={`relative h-5 w-10 rounded-full transition ${rule.enabled ? 'bg-success' : 'bg-white/15'}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${rule.enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="truncate font-bold text-text-1">{rule.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-text-3">{rule.reasonCode}</div>
                    </AdminTableCell>
                    <AdminTableCell><span className="text-xs capitalize text-text-2">{rule.category}</span></AdminTableCell>
                    <AdminTableCell>
                      <span className={`${BADGE_CLS} ${RISK_STATUS_COLORS[rule.action] || NEUTRAL_BADGE}`}>{rule.action}</span>
                    </AdminTableCell>
                    <AdminTableCell align="right">
                      <span className="font-mono text-xs font-bold text-text-2">{rule.priority}</span>
                    </AdminTableCell>
                    <AdminTableActionsCell>
                      <RowActions
                        label={t('admin.risk.rules.operations')}
                        items={[
                          { key: 'edit', label: t('admin.risk.rules.edit'), icon: 'edit', onClick: () => { setEditRule(rule); setRuleForm({ name: rule.name, category: rule.category, conditions: rule.conditions || [], action: rule.action, severity: rule.severity, reasonCode: rule.reasonCode, description: rule.description || '' }); setShowRuleModal(true); } },
                          { key: 'delete', label: t('admin.risk.rules.delete'), icon: 'delete', tone: 'danger', onClick: () => deleteRule(rule._id) },
                        ]}
                      />
                    </AdminTableActionsCell>
                  </AdminTableRow>
                ))}
              </AdminTable>
              <AdminPager
                page={rulePage}
                pages={rulePages}
                onPage={setRulePage}
                totalLabel={t('admin.risk.rules.countLine', {
                  count: rules.length.toLocaleString(locale),
                  page: rulePage,
                  pages: rulePages,
                })}
              />
            </>
          )}
        </div>
      )}

      {showRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/10 bg-bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">{editRule ? 'edit' : 'add_task'}</span>
              </span>
              <h3 className="text-sm font-extrabold text-text-1">{editRule ? t('admin.risk.ruleModal.editTitle') : t('admin.risk.ruleModal.newTitle')}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL_CLS}>{t('admin.risk.ruleModal.name')}</label>
                <input value={ruleForm.name} onChange={e => setRuleForm(f => ({ ...f, name: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>{t('admin.risk.ruleModal.category')}</label>
                  <select value={ruleForm.category} onChange={e => setRuleForm(f => ({ ...f, category: e.target.value }))} className={INPUT_CLS}>
                    <option value="account">{t('admin.risk.ruleModal.categories.account')}</option>
                    <option value="authentication">{t('admin.risk.ruleModal.categories.authentication')}</option>
                    <option value="deposit">{t('admin.risk.ruleModal.categories.deposit')}</option>
                    <option value="withdrawal">{t('admin.risk.ruleModal.categories.withdrawal')}</option>
                    <option value="financial">{t('admin.risk.ruleModal.categories.financial')}</option>
                    <option value="kyc">KYC</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>{t('admin.risk.ruleModal.action')}</label>
                  <select value={ruleForm.action} onChange={e => setRuleForm(f => ({ ...f, action: e.target.value }))} className={INPUT_CLS}>
                    <option value="ALLOW">{t('admin.risk.actionAllow')}</option>
                    <option value="REVIEW">{t('admin.risk.actionReview')}</option>
                    <option value="RESTRICT">{t('admin.risk.actionRestrict')}</option>
                    <option value="BLOCK">{t('admin.risk.actionBlock')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>{t('admin.risk.ruleModal.severity')}</label>
                  <select value={ruleForm.severity} onChange={e => setRuleForm(f => ({ ...f, severity: e.target.value }))} className={INPUT_CLS}>
                    <option value="LOW">{t('admin.risk.levelLow')}</option>
                    <option value="MEDIUM">{t('admin.risk.levelMedium')}</option>
                    <option value="HIGH">{t('admin.risk.levelHigh')}</option>
                    <option value="CRITICAL">{t('admin.risk.levelCritical')}</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>{t('admin.risk.ruleModal.reasonCode')}</label>
                  <input value={ruleForm.reasonCode} onChange={e => setRuleForm(f => ({ ...f, reasonCode: e.target.value }))} className={INPUT_CLS} placeholder="RISK_EXAMPLE" />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>{t('admin.risk.ruleModal.description')}</label>
                <input value={ruleForm.description} onChange={e => setRuleForm(f => ({ ...f, description: e.target.value }))} className={INPUT_CLS} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className={LABEL_CLS}>{t('admin.risk.ruleModal.conditions')}</label>
                  <button
                    onClick={() => setRuleForm(f => ({ ...f, conditions: [...f.conditions, { field: '', operator: 'gte', value: '' }] }))}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-primary/30 bg-primary/15 px-2 text-[11px] font-bold text-primary transition hover:bg-primary/25"
                  >
                    <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">add</span>
                    {t('admin.risk.ruleModal.addCondition')}
                  </button>
                </div>
                {ruleForm.conditions.map((c, i) => (
                  <div key={i} className="mb-2 flex flex-wrap items-center gap-2">
                    <input value={c.field} onChange={e => { const conds = [...ruleForm.conditions]; conds[i].field = e.target.value; setRuleForm(f => ({ ...f, conditions: conds })); }} placeholder={t('admin.risk.ruleModal.fieldPlaceholder')} className="flex-1 rounded-lg border border-white/10 bg-bg-deep px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none" />
                    <select value={c.operator} onChange={e => { const conds = [...ruleForm.conditions]; conds[i].operator = e.target.value; setRuleForm(f => ({ ...f, conditions: conds })); }} className="rounded-lg border border-white/10 bg-bg-deep px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none">
                      <option value="gt">&gt;</option>
                      <option value="gte">&gt;=</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">&lt;=</option>
                      <option value="eq">=</option>
                      <option value="neq">!=</option>
                      <option value="between">between</option>
                    </select>
                    <input value={c.value} onChange={e => { const conds = [...ruleForm.conditions]; conds[i].value = e.target.value; setRuleForm(f => ({ ...f, conditions: conds })); }} placeholder={t('admin.risk.ruleModal.valuePlaceholder')} className="w-24 rounded-lg border border-white/10 bg-bg-deep px-2.5 py-1.5 text-xs text-text-1 placeholder:text-text-3/60 focus:border-white/25 focus:outline-none" />
                    {ruleForm.conditions.length > 1 && (
                      <button
                        onClick={() => setRuleForm(f => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}
                        aria-label={t('admin.risk.removeCondition')}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-danger/25 bg-danger/10 text-danger transition hover:bg-danger/20"
                      >
                        <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className={MODAL_FOOTER_CLS}>
                <button onClick={() => { setShowRuleModal(false); setEditRule(null); }} className={ADMIN_BTN}>
                  {t('admin.risk.ruleModal.cancel')}
                </button>
                <button
                  onClick={saveRule}
                  disabled={actionLoading === 'save-rule' || !ruleForm.name || !ruleForm.reasonCode}
                  className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
                >
                  <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
                  {actionLoading === 'save-rule' ? t('common.saving') : t('admin.risk.ruleModal.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {findingModal && (
        <FindingModal finding={findingModal} onClose={() => setFindingModal(null)} onConfirm={confirmFindingResolve} loading={actionLoading === `finding-${findingModal._id}`} />
      )}

      {overrideModal && (
        <OverrideModal onClose={() => setOverrideModal(null)} onConfirm={confirmOverride} loading={!!actionLoading} />
      )}
    </div>
  );
}
