import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY, ADMIN_BTN_GHOST } from '../../components/admin/AdminPageHeader.jsx';
import { AdminTable, AdminTableRow, AdminTableCell, AdminTableEmpty, AdminKpiCard, ActiveSwitch } from '../../components/admin/AdminTable.jsx';
import RowActions from '../../components/admin/RowActions.jsx';
import { toKeySegment } from '../../utils/smsSenderLogic.js';

/**
 * Gönderici kaydı + ülke/mevzuat onayı yönetimi.
 *
 * Bu ekranın var oluş sebebi: Twilio'da bir numaranın mesaj gönderebilmesi
 * TEK bir kapı değil. Trial hesapta yalnız doğrulanmış numaralara ve kayıt
 * ülkesine gönderilir (en fazla 5 numara, 30 gün, operatör belirttiği gibi
 * ücretsiz demo hesabı); ABD/Kanada uzun numaralar için A2P 10DLC marka +
 * kampanya kaydı gerekir ve bu kayıt resmen ÜCRETLİ hesap şartıdır;
 * birçok ülke yerel gönderici (sender ID) ön kaydı ister. Bu kurallar
 * panelde görünmezse operatör, mesajın neden gitmediğini yalnız Twilio hata
 * kodundan öğrenir.
 *
 * Gönderimde etkisi (`services/smsSender.js` → `resolveSenderGate`):
 *   • Ücretli hesap + onaylı olmayan gönderici → gönderim durur.
 *   • Gateway From numarası kayıttakiyle eşleşmiyorsa → durur.
 *   • Alıcının ülkesi göndericinin onaylı listesinde değilse → O ALICI atlanır.
 *   • Trial + liste dolu + numara listede değilse → O ALICI atlanır.
 */

const EMPTY_SENDER = {
  label: '',
  senderNumber: '',
  messagingServiceSid: '',
  senderCountry: 'TR',
  capability: 'long_code',
  registrationType: 'none',
  approvalStatus: 'not_submitted',
  registrationId: '',
  brandName: '',
  useCase: '',
  destinationCountries: [],
  dailyLimit: 0,
  trialVerifiedNumbers: [],
  trialExpiresAt: '',
  notes: '',
  isActive: true,
};

const APPROVED = ['not_required', 'approved'];

function NewSenderButton({ onClick, className }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className={className}>
      <span className="material-symbols-outlined !text-[17px]" aria-hidden="true">add</span>
      {t('admin.smsSenders.newSender')}
    </button>
  );
}

function CountryInput({ value, onChange, knownCountries }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');

  function add(raw) {
    const iso = String(raw).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(iso) || value.includes(iso)) return;
    onChange([...value, iso]);
    setDraft('');
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {value.length === 0 && (
          <span className="text-[11px] text-text-3">{t('admin.smsSenders.noCountryLimit')}</span>
        )}
        {value.map(iso => (
          <span key={iso} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-text-2">
            {iso}
            <button
              type="button"
              onClick={() => onChange(value.filter(c => c !== iso))}
              className="text-text-3 hover:text-danger transition"
              aria-label={t('common.remove')}
            >
              <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">close</span>
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
          placeholder="TR"
          maxLength={2}
          className="w-20 h-8 rounded-lg bg-bg-deep border border-white/10 px-2 font-mono text-xs uppercase text-text-1"
        />
        <button type="button" onClick={() => add(draft)} className={ADMIN_BTN_GHOST}>
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">add</span>
          {t('admin.smsSenders.addCountry')}
        </button>
        {knownCountries.length > 0 && (
          <select
            value=""
            onChange={e => add(e.target.value)}
            className="h-8 rounded-lg bg-bg-deep border border-white/10 px-2 text-xs text-text-2"
          >
            <option value="">{t('admin.smsSenders.pickCountry')}</option>
            {knownCountries.filter(c => !value.includes(c)).map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export default function AdminSmsSenders({ embedded = false }) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState(null);
  const [gate, setGate] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [trialDraft, setTrialDraft] = useState([]);
  const [trialInput, setTrialInput] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [listRes, gateRes, settingsRes] = await Promise.all([
        api.get('/admin/sms/senders'),
        api.get('/admin/sms/senders/gate').catch(() => ({ data: { blocked: null, reasons: [] } })),
        api.get('/admin/sms/settings').catch(() => ({ data: null })),
      ]);
      setData(listRes.data);
      setGate(gateRes.data);
      setSettings(settingsRes.data);
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.smsSenders.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const senders = data?.senders ?? [];
  const knownCountries = data?.knownCountries ?? [];
  const trialLimit = data?.trialVerifiedLimit ?? 5;
  const isTrial = settings?.accountType === 'trial';

  function addTrialNumber() {
    const raw = trialInput.trim();
    if (!raw) return;
    if (trialDraft.includes(raw) || trialDraft.length >= trialLimit) { setTrialInput(''); return; }
    setTrialDraft(list => [...list, raw]);
    setTrialInput('');
  }

  function openCreate() {
    setError('');
    setNotice('');
    setForm({ ...EMPTY_SENDER });
    setTrialDraft([]);
  }

  function openEdit(sender) {
    setError('');
    setNotice('');
    setForm({
      _id: sender._id,
      label: sender.label,
      senderNumber: sender.senderNumber ?? '',
      messagingServiceSid: sender.messagingServiceSid ?? '',
      senderCountry: sender.senderCountry,
      capability: sender.capability,
      registrationType: sender.registrationType,
      approvalStatus: sender.approvalStatus,
      registrationId: sender.registrationId ?? '',
      brandName: sender.brandName ?? '',
      useCase: sender.useCase ?? '',
      destinationCountries: sender.destinationCountries ?? [],
      dailyLimit: sender.dailyLimit ?? 0,
      trialVerifiedNumbers: sender.trialVerifiedNumbers ?? [],
      trialExpiresAt: sender.trialExpiresAt ? String(sender.trialExpiresAt).slice(0, 10) : '',
      notes: sender.notes ?? '',
      isActive: sender.isActive,
    });
    setTrialDraft(sender.trialVerifiedNumbers ?? []);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = {
        label: form.label,
        senderNumber: form.senderNumber || null,
        messagingServiceSid: form.messagingServiceSid || null,
        senderCountry: form.senderCountry,
        capability: form.capability,
        registrationType: form.registrationType,
        approvalStatus: form.approvalStatus,
        registrationId: form.registrationId || null,
        brandName: form.brandName || null,
        useCase: form.useCase || null,
        destinationCountries: form.destinationCountries,
        dailyLimit: Number(form.dailyLimit) || 0,
        trialVerifiedNumbers: trialDraft,
        trialExpiresAt: form.trialExpiresAt || null,
        notes: form.notes,
        isActive: form.isActive,
        // Ulusal numara (0532…) yazılabilsin diye gateway'in ülke kodu.
        defaultCountryCode: settings?.defaultCountryCode ?? null,
      };
      const { data: res } = form._id
        ? await api.patch(`/admin/sms/senders/${form._id}`, payload)
        : await api.post('/admin/sms/senders', payload);

      const rejected = res.rejectedTrialNumbers ?? [];
      setForm(null);
      setNotice(rejected.length
        ? t('admin.smsSenders.savedWithRejected', { nums: rejected.join(', ') })
        : t('admin.smsSenders.saved'));
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.smsSenders.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(sender) {
    setError('');
    setNotice('');
    if (!window.confirm(t('admin.smsSenders.deleteConfirm', { label: sender.label }))) return;
    try {
      await api.delete(`/admin/sms/senders/${sender._id}`);
      setNotice(t('admin.smsSenders.deleted'));
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.smsSenders.deleteError'));
    }
  }

  async function toggleActive(sender, next) {
    setError('');
    try {
      await api.patch(`/admin/sms/senders/${sender._id}`, {
        isActive: next,
        senderCountry: sender.senderCountry,
        label: sender.label,
        capability: sender.capability,
        registrationType: sender.registrationType,
        approvalStatus: sender.approvalStatus,
      });
      load();
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.smsSenders.saveError'));
    }
  }

  const active = senders.find(s => s.isActive);
  const approvedCount = senders.filter(s => APPROVED.includes(s.approvalStatus)).length;

  const body = (
    <>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">{error}</div>
      )}
      {notice && !error && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/30 text-sm text-success">{notice}</div>
      )}

      {/* Hesap tipi + gönderim kapısı — en sık sorulan iki sorunun cevabı */}
      <div className="grid gap-3 mb-5 sm:grid-cols-2">
        <div className={`p-3 rounded-xl border ${isTrial ? 'bg-warning/10 border-warning/30' : 'bg-bg-card border-white/10'}`}>
          <div className="text-[10px] uppercase tracking-wide text-text-3">{t('admin.smsSenders.accountType')}</div>
          <div className={`mt-1 text-sm font-extrabold ${isTrial ? 'text-warning' : 'text-text-1'}`}>
            {t(`admin.smsSenders.accountType.${settings?.accountType ?? 'unknown'}`)}
          </div>
          <p className="mt-1 text-[11px] text-text-3">{t(`admin.smsSenders.accountTypeHelp.${settings?.accountType ?? 'unknown'}`)}</p>
        </div>
        <div className={`p-3 rounded-xl border ${gate?.blocked ? 'bg-danger/10 border-danger/30' : 'bg-success/10 border-success/30'}`}>
          <div className="text-[10px] uppercase tracking-wide text-text-3">{t('admin.smsSenders.gateTitle')}</div>
          <div className={`mt-1 text-sm font-extrabold ${gate?.blocked ? 'text-danger' : 'text-success'}`}>
            {gate?.blocked ? t('admin.smsSenders.gateBlocked') : t('admin.smsSenders.gateReady')}
          </div>
          {gate?.blocked && (
            <p className="mt-1 text-[11px] text-danger">{t(`admin.smsSenders.reason.${toKeySegment(gate.blocked)}`)}</p>
          )}
        </div>
      </div>

      {isTrial && (
        <div className="mb-5 p-3 rounded-xl bg-warning/10 border border-warning/30">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined !text-[16px] text-warning" aria-hidden="true">warning</span>
            <span className="text-xs font-bold text-warning">{t('admin.smsSenders.trialBanner')}</span>
          </div>
          <ul className="text-[11px] text-warning/90 space-y-0.5 list-disc pl-4">
            <li>{t('admin.smsSenders.trialRuleNumbers')}</li>
            <li>{t('admin.smsSenders.trialRuleCountry')}</li>
            <li>{t('admin.smsSenders.trialRuleTemplate')}</li>
            <li>{t('admin.smsSenders.trialRuleExpiry')}</li>
          </ul>
        </div>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: t('admin.smsSenders.statTotal'), value: senders.length },
          { label: t('admin.smsSenders.statApproved'), value: approvedCount, tone: approvedCount ? 'text-success' : 'text-warning' },
          { label: t('admin.smsSenders.statActive'), value: active ? 1 : 0 },
          { label: t('admin.smsSenders.statCountries'), value: active?.destinationCountries?.length ?? 0 },
        ].map(k => (
          <AdminKpiCard key={k.label} label={k.label} value={k.value.toLocaleString(locale)} tone={k.tone} />
        ))}
      </section>

      {loading ? (
        <div className="rounded-xl border border-white/10 bg-bg-card p-4 text-sm text-text-3">{t('common.loading')}</div>
      ) : (
        <AdminTable
          columns={[
            { key: 'label', label: t('admin.smsSenders.columnSender') },
            { key: 'country', label: t('admin.smsSenders.columnCountry') },
            { key: 'reg', label: t('admin.smsSenders.columnRegistration') },
            { key: 'approval', label: t('admin.smsSenders.columnApproval') },
            { key: 'dest', label: t('admin.smsSenders.columnDestinations') },
            { key: 'active', label: t('admin.smsSenders.columnActive') },
            { key: 'actions', label: t('admin.smsSenders.columnActions'), align: 'right' },
          ]}
        >
          {senders.length === 0 ? (
            <AdminTableEmpty colSpan={7}>{t('admin.smsSenders.empty')}</AdminTableEmpty>
          ) : senders.map(s => {
            const ok = APPROVED.includes(s.approvalStatus);
            return (
              <AdminTableRow key={s._id} dimmed={!s.isActive}>
                <AdminTableCell>
                  <div className="min-w-0">
                    <div className="truncate font-bold text-text-1">{s.label}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-text-3">
                      {s.senderNumber ?? s.messagingServiceSid ?? '—'}
                    </div>
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <span className="font-mono text-xs text-text-2">{s.senderCountry}</span>
                  <div className="mt-0.5 text-[11px] text-text-3">{t(`admin.smsSenders.capability.${toKeySegment(s.capability)}`)}</div>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="text-xs text-text-2">{t(`admin.smsSenders.registrationType.${toKeySegment(s.registrationType)}`)}</div>
                  {s.registrationId && <div className="mt-0.5 font-mono text-[11px] text-text-3 truncate max-w-[160px]">{s.registrationId}</div>}
                </AdminTableCell>
                <AdminTableCell>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    ok ? 'border-success/30 bg-success/15 text-success' : 'border-warning/30 bg-warning/15 text-warning'
                  }`}>
                    {t(`admin.smsSenders.approval.${toKeySegment(s.approvalStatus)}`)}
                  </span>
                </AdminTableCell>
                <AdminTableCell>
                  <div className="flex flex-wrap gap-1">
                    {(s.destinationCountries ?? []).length === 0
                      ? <span className="text-[11px] text-text-3">{t('admin.smsSenders.allCountries')}</span>
                      : s.destinationCountries.map(c => (
                        <span key={c} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-text-2">{c}</span>
                      ))}
                  </div>
                </AdminTableCell>
                <AdminTableCell>
                  <ActiveSwitch checked={s.isActive} onChange={next => toggleActive(s, next)} label={t('admin.smsSenders.columnActive')} />
                </AdminTableCell>
                <AdminTableCell align="right">
                  <div className="flex justify-end">
                    <RowActions items={[
                      { key: 'edit', label: t('common.edit'), icon: 'edit', onClick: () => openEdit(s) },
                      { key: 'delete', label: t('common.delete'), icon: 'delete', tone: 'danger', onClick: () => remove(s) },
                    ]} />
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </AdminTable>
      )}

      {form && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 overflow-y-auto" onClick={() => setForm(null)}>
          <div className="bg-bg-card border border-white/10 rounded-xl p-5 max-w-lg w-full my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-primary/15 text-primary">
                <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">phonelink_ring</span>
              </span>
              <h2 className="text-sm font-extrabold text-text-1">
                {form._id ? t('admin.smsSenders.editSender') : t('admin.smsSenders.newSender')}
              </h2>
            </div>

            <div className="space-y-3">
              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsSenders.fieldLabel')}
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldNumber')}
                  <input
                    value={form.senderNumber}
                    onChange={e => setForm(f => ({ ...f, senderNumber: e.target.value }))}
                    placeholder="+15551234567"
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 font-mono text-xs text-text-1 normal-case tracking-normal font-normal"
                  />
                </label>
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldSenderCountry')}
                  <input
                    value={form.senderCountry}
                    onChange={e => setForm(f => ({ ...f, senderCountry: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="US"
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 font-mono text-xs uppercase text-text-1"
                  />
                </label>
              </div>
              <p className="text-[11px] text-text-3">{t('admin.smsSenders.senderNumberHelp')}</p>

              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsSenders.fieldMessagingService')}
                <input
                  value={form.messagingServiceSid}
                  onChange={e => setForm(f => ({ ...f, messagingServiceSid: e.target.value }))}
                  placeholder="MG…"
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 font-mono text-xs text-text-1 normal-case tracking-normal font-normal"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldCapability')}
                  <select
                    value={form.capability}
                    onChange={e => setForm(f => ({ ...f, capability: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                  >
                    {data?.capabilities?.map(c => <option key={c} value={c}>{t(`admin.smsSenders.capability.${toKeySegment(c)}`)}</option>)}
                  </select>
                </label>
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldRegistrationType')}
                  <select
                    value={form.registrationType}
                    onChange={e => setForm(f => ({ ...f, registrationType: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                  >
                    {data?.registrationTypes?.map(c => <option key={c} value={c}>{t(`admin.smsSenders.registrationType.${toKeySegment(c)}`)}</option>)}
                  </select>
                </label>
              </div>

              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsSenders.fieldApproval')}
                <select
                  value={form.approvalStatus}
                  onChange={e => setForm(f => ({ ...f, approvalStatus: e.target.value }))}
                  className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                >
                  {data?.approvedStatuses?.map(c => <option key={c} value={c}>{t(`admin.smsSenders.approval.${toKeySegment(c)}`)}</option>)}
                </select>
              </label>
              <p className="text-[11px] text-text-3">{t('admin.smsSenders.approvalHelp')}</p>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldRegistrationId')}
                  <input
                    value={form.registrationId}
                    onChange={e => setForm(f => ({ ...f, registrationId: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 font-mono text-xs text-text-1 normal-case tracking-normal font-normal"
                  />
                </label>
                <label className="block text-[11px] uppercase font-bold text-text-3">
                  {t('admin.smsSenders.fieldBrand')}
                  <input
                    value={form.brandName}
                    onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg bg-bg-deep border border-white/10 px-3 text-sm text-text-1 normal-case tracking-normal font-normal"
                  />
                </label>
              </div>

              <div>
                <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">{t('admin.smsSenders.fieldDestinations')}</div>
                <CountryInput
                  value={form.destinationCountries}
                  onChange={list => setForm(f => ({ ...f, destinationCountries: list }))}
                  knownCountries={knownCountries}
                />
                <p className="mt-1 text-[11px] text-text-3">{t('admin.smsSenders.destinationsHelp')}</p>
              </div>

              <div>
                <div className="text-[11px] uppercase font-bold text-text-3 mb-1.5">
                  {t('admin.smsSenders.fieldTrialNumbers', { n: trialDraft.length, max: trialLimit })}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {trialDraft.map(n => (
                    <span key={n} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-text-2">
                      {n}
                      <button
                        type="button"
                        onClick={() => setTrialDraft(list => list.filter(x => x !== n))}
                        className="text-text-3 hover:text-danger transition"
                        aria-label={t('common.remove')}
                      >
                        <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">close</span>
                      </button>
                    </span>
                  ))}
                </div>
                {trialDraft.length < trialLimit && (
                  <div className="flex gap-2">
                    <input
                      value={trialInput}
                      onChange={e => setTrialInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') { return; }
                        e.preventDefault();
                        addTrialNumber();
                      }}
                      placeholder="+90…"
                      className="flex-1 h-9 rounded-lg bg-bg-deep border border-white/10 px-3 font-mono text-xs text-text-1"
                    />
                    <button type="button" onClick={addTrialNumber} className={ADMIN_BTN_GHOST}>
                      <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">add</span>
                      {t('common.add')}
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-text-3">{t('admin.smsSenders.trialNumbersHelp')}</p>
              </div>

              <label className="block text-[11px] uppercase font-bold text-text-3">
                {t('admin.smsSenders.fieldNotes')}
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-bg-deep border border-white/10 px-3 py-2 text-sm text-text-1 normal-case tracking-normal font-normal"
                />
              </label>

              <div className="flex items-center gap-2">
                <ActiveSwitch checked={form.isActive} onChange={next => setForm(f => ({ ...f, isActive: next }))} label={t('admin.smsSenders.fieldActive')} />
                <span className="text-xs text-text-2">{t('admin.smsSenders.fieldActive')}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setForm(null)} className={ADMIN_BTN}>{t('common.cancel')}</button>
              <button onClick={save} disabled={saving} className={ADMIN_BTN_PRIMARY}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // Gömülü kullanımda (Modules → SMS Gateway kartı) tam sayfa başlığı
  // render edilmez; kartın kendi başlığı var.
  if (embedded) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-[720px] text-sm text-text-3">{t('admin.smsSenders.subtitle')}</p>
          <NewSenderButton onClick={openCreate} className={ADMIN_BTN_PRIMARY} />
        </div>
        {body}
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.smsSenders.title') }]}
        title={t('admin.smsSenders.title')}
        sub={t('admin.smsSenders.subtitle')}
        actions={<NewSenderButton onClick={openCreate} className={ADMIN_BTN_PRIMARY} />}
      />
      {body}
    </div>
  );
}