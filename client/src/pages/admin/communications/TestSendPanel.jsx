// client/src/pages/admin/communications/TestSendPanel.jsx
//
// İletişim → (E-posta|SMS) → Test / send: gerçek uçtan tek gönderim.
//  - E-posta: alıcı serbest (boş bırakılırsa sunucu yöneticinin kendi
//    adresine gönderir — `POST /admin/settings/email/test`).
//  - SMS: iki adım — (1) kuru bağlantı testi (`POST /admin/sms/settings/test`,
//    mesaj göndermez), (2) serbest metinle gerçek test mesajı
//    (`POST /admin/sms/test-send`, maliyeti gerçek, sonuç SmsLog'a düşer).
import { useState } from 'react';
import api from '../../../services/api';
import { useTranslation } from '../../../i18n';
import { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../../components/admin/AdminPageHeader.jsx';
import { smsGatewayErrorText, deriveSmsMissing } from '../smsTemplateLogic.js';

const INPUT = 'w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 outline-none transition focus:border-primary';
const LABEL = 'block text-xs font-bold text-text-3 mb-1';

export default function TestSendPanel({ channel }) {
  const { t } = useTranslation();
  const isEmail = channel === 'email';

  // E-posta
  const [to, setTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);

  // SMS
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsResult, setSmsResult] = useState(null);

  const [error, setError] = useState('');

  async function sendEmail() {
    setEmailSending(true);
    setError('');
    setEmailResult(null);
    try {
      const body = {};
      if (to.trim()) body.to = to.trim();
      const r = await api.post('/admin/settings/email/test', body);
      setEmailResult({ ok: true, to: r.data.to });
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.communications.test.emailFailed'));
    } finally {
      setEmailSending(false);
    }
  }

  async function checkSms() {
    setChecking(true);
    setError('');
    setCheckResult(null);
    try {
      const r = await api.post('/admin/sms/settings/test');
      setCheckResult(r.data);
    } catch (e) {
      setError(e.response?.data?.error?.message || t('admin.communications.test.smsCheckFailed'));
    } finally {
      setChecking(false);
    }
  }

  async function sendSms() {
    setSmsSending(true);
    setError('');
    setSmsResult(null);
    try {
      const r = await api.post('/admin/sms/test-send', { to: phone.trim(), message: message.trim() });
      setSmsResult(r.data);
    } catch (e) {
      const err = e.response?.data?.error;
      setError(smsGatewayErrorText(t, err?.code, err?.message) || t('admin.communications.test.smsSendFailed'));
    } finally {
      setSmsSending(false);
    }
  }

  const okBox = 'rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success';
  const errBox = 'rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger';

  if (isEmail) {
    return (
      <div className="rounded-xl border border-white/10 bg-bg-card p-4">
        <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-3">
          {t('admin.communications.test.emailHint')}
        </p>
        {error && <div className={`mb-4 ${errBox}`}>{error}</div>}
        {emailResult?.ok && (
          <div className={`mb-4 ${okBox}`}>{t('admin.communications.test.emailSent', { email: emailResult.to })}</div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,320px)_auto] sm:items-end">
          <div>
            <label className={LABEL} htmlFor="test-email-to">{t('admin.communications.test.emailTo')}</label>
            <input
              id="test-email-to"
              type="email"
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder={t('admin.communications.test.emailToPlaceholder')}
              className={INPUT}
            />
          </div>
          <button type="button" onClick={sendEmail} disabled={emailSending} className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">send</span>
            {emailSending ? t('admin.communications.test.sending') : t('admin.communications.test.send')}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-3/70">{t('admin.communications.test.emailToHint')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-bg-card p-4">
      <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-text-3">
        {t('admin.communications.test.smsHint')}
      </p>
      {error && <div className={`mb-4 ${errBox}`}>{error}</div>}

      {/* 1 — kuru bağlantı testi (mesaj göndermez, maliyeti yok) */}
      <div className="mb-5 border-b border-white/[0.06] pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-bold text-text-1">{t('admin.communications.test.smsCheckTitle')}</h4>
          <button type="button" onClick={checkSms} disabled={checking} className={`${ADMIN_BTN} disabled:opacity-40`}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">network_check</span>
            {checking ? t('admin.communications.test.checking') : t('admin.communications.test.check')}
          </button>
        </div>
        <p className="text-[11px] text-text-3/70">{t('admin.communications.test.smsCheckHint')}</p>
        {checkResult && (
          <div className={`mt-2 ${checkResult.ok ? okBox : errBox}`}>
            {checkResult.ok ? (
              t('admin.communications.test.smsCheckOk', { name: checkResult.friendlyName || '' })
            ) : (
              <>
                <div>{smsGatewayErrorText(t, checkResult.code, checkResult.error)}</div>
                {!checkResult.ok && Array.isArray(checkResult.missing) && checkResult.missing.length > 0 && (
                  <ul className="mt-1 list-disc list-inside text-[12px] opacity-90">
                    {deriveSmsMissing(checkResult).map(key => (
                      <li key={key}>{t(`admin.smsGateway.missing.${key}`)}</li>
                    ))}
                  </ul>
                )}
                {checkResult.code === 'SMS_NOT_CONFIGURED' && (
                  <p className="mt-1 text-[12px] opacity-80">{t('admin.smsGateway.senderRequiredHint')}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 2 — gerçek test mesajı */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-bold text-text-1">{t('admin.communications.test.smsSendTitle')}</h4>
          <span className="rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">
            {t('admin.communications.test.smsCostNote')}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label className={LABEL} htmlFor="test-sms-to">{t('admin.communications.test.smsTo')}</label>
            <input
              id="test-sms-to"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('admin.communications.test.smsToPlaceholder')}
              className={`${INPUT} font-mono`}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="test-sms-message">{t('admin.communications.test.smsMessage')}</label>
            <input
              id="test-sms-message"
              type="text"
              maxLength={320}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={t('admin.communications.test.smsMessagePlaceholder')}
              className={INPUT}
            />
          </div>
          <button
            type="button"
            onClick={sendSms}
            disabled={smsSending || !phone.trim() || !message.trim()}
            className={`${ADMIN_BTN_PRIMARY} disabled:opacity-40`}
          >
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">sms</span>
            {smsSending ? t('admin.communications.test.sending') : t('admin.communications.test.send')}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-text-3/70">{t('admin.communications.test.smsLogNote')}</p>
        {smsResult && (
          <div className={`mt-3 ${smsResult.ok ? okBox : errBox}`}>
            {smsResult.ok
              ? t('admin.communications.test.smsSent', { sid: smsResult.sid || '', status: smsResult.status || '' })
              : (smsGatewayErrorText(t, smsResult.code, smsResult.error) || t('admin.communications.test.smsSendFailed'))}
          </div>
        )}
      </div>
    </div>
  );
}
