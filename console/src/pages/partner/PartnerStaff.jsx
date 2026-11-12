import React, { useState, useEffect } from 'react';
import { partnerApi } from '../../api/client.js';

const h = React.createElement;

export const PARTNER_ROLES = [
  { name: 'partner_ops', displayName: 'Partner Operasyon (partner_ops)' },
  { name: 'partner_analyst', displayName: 'Partner Analist (partner_analyst)' },
  { name: 'partner_admin', displayName: 'Partner Yöneticisi (partner_admin)' },
];

export default function PartnerStaff() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('partner_ops');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Suspend action state
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await partnerApi.listStaff();
      setStaffList(res?.staff || []);
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Personel listesi yüklenirken bir hata oluştu.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) {
      setError('E-posta adresi zorunludur.');
      return;
    }

    setInviteLoading(true);
    setError(null);
    setInviteResult(null);
    try {
      const res = await partnerApi.inviteStaff({
        email: inviteEmail.trim().toLowerCase(),
        username: inviteUsername.trim() || undefined,
        roleName: inviteRole,
      });

      setInviteResult(res);
      setSuccessMsg('Davet başarıyla oluşturuldu.');
      fetchStaff();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Personel davet edilirken bir hata oluştu.';
      setError(msg);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleSuspend = async (staffId, username) => {
    if (!window.confirm(`"${username || 'Personel'}" hesabını askıya almak istediğinize emin misiniz?`)) {
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await partnerApi.suspendStaff(staffId);
      setSuccessMsg('Personel hesabı başarıyla askıya alındı.');
      fetchStaff();
    } catch (err) {
      const msg =
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Personel askıya alınırken bir hata oluştu.';
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  return h(
    'div',
    { className: 'space-y-6' },
    // Header
    h(
      'div',
      { className: 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4' },
      h(
        'div',
        null,
        h('h1', { className: 'text-2xl font-bold text-white' }, 'Partner Personeli ve Yetkiler'),
        h('p', { className: 'text-sm text-slate-400 mt-1' }, 'Partner organizasyonunuza bağlı personel hesapları ve roller.')
      ),
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              setInviteResult(null);
              setInviteEmail('');
              setInviteUsername('');
              setInviteRole('partner_ops');
              setInviteModalOpen(true);
            },
            className: 'inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors',
          },
          '+ Yeni Personel Davet Et'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: fetchStaff,
            className: 'px-3 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors',
          },
          'Yenile'
        )
      )
    ),

    error && h('div', { className: 'p-4 bg-rose-950/60 border border-rose-500/40 rounded-lg text-sm text-rose-300' }, error),
    successMsg && h('div', { className: 'p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-lg text-sm text-emerald-300' }, successMsg),

    loading
      ? h('div', { className: 'p-8 text-center text-slate-400 text-sm' }, 'Personel listesi yükleniyor...')
      : staffList.length === 0
      ? h(
          'div',
          { className: 'p-12 text-center bg-slate-800/40 border border-slate-800 rounded-lg' },
          h('p', { className: 'text-slate-400 text-sm' }, 'Kayıtlı personel bulunamadı.')
        )
      : h(
          'div',
          { className: 'bg-slate-800 border border-slate-700 rounded-lg overflow-hidden' },
          h(
            'table',
            { className: 'min-w-full divide-y divide-slate-700 text-left' },
            h(
              'thead',
              { className: 'bg-slate-900/60 text-xs font-semibold text-slate-400 uppercase tracking-wider' },
              h(
                'tr',
                null,
                h('th', { className: 'px-6 py-3' }, 'Kullanıcı Adı / E-posta'),
                h('th', { className: 'px-6 py-3' }, 'Rol'),
                h('th', { className: 'px-6 py-3' }, 'Durum'),
                h('th', { className: 'px-6 py-3' }, '2FA Durumu'),
                h('th', { className: 'px-6 py-3' }, 'Son Giriş'),
                h('th', { className: 'px-6 py-3 text-right' }, 'İşlemler')
              )
            ),
            h(
              'tbody',
              { className: 'divide-y divide-slate-700 text-sm' },
              staffList.map((member) => {
                const isSuspended = member.status === 'suspended';
                const roleObj = member.assignment?.role || {};
                const roleLabel = roleObj.displayName || roleObj.name || 'Partner Personeli';

                return h(
                  'tr',
                  { key: member._id, className: 'hover:bg-slate-700/30 transition-colors' },
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h('div', { className: 'font-medium text-white' }, member.username || '-'),
                    h('div', { className: 'text-xs text-slate-400' }, member.email)
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      { className: 'px-2 py-0.5 rounded text-xs bg-slate-900 text-indigo-300 border border-slate-700' },
                      roleLabel
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap' },
                    h(
                      'span',
                      {
                        className: `px-2 py-0.5 rounded text-xs font-medium border ${
                          isSuspended
                            ? 'bg-rose-950 text-rose-400 border-rose-500/40'
                            : 'bg-emerald-950 text-emerald-400 border-emerald-500/40'
                        }`,
                      },
                      isSuspended ? 'Askıya Alındı' : 'Aktif'
                    )
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-xs text-slate-300' },
                    member.twoFactor?.enabled ? '✓ Açık' : 'Kapalı'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-xs text-slate-400' },
                    member.lastLoginAt ? new Date(member.lastLoginAt).toLocaleString('tr-TR') : 'Hiç giriş yapmadı'
                  ),
                  h(
                    'td',
                    { className: 'px-6 py-4 whitespace-nowrap text-right text-xs font-medium' },
                    !isSuspended &&
                      h(
                        'button',
                        {
                          type: 'button',
                          disabled: actionLoading,
                          onClick: () => handleSuspend(member._id, member.username),
                          className: 'text-amber-400 hover:text-amber-300 bg-slate-900 px-3 py-1 rounded border border-slate-700 hover:border-amber-500 transition-colors disabled:opacity-50',
                        },
                        'Askıya Al'
                      )
                  )
                );
              })
            )
          )
        ),

    // Invite Modal (shows inviteUrl once)
    inviteModalOpen &&
      h(
        'div',
        { className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm' },
        h(
          'div',
          { className: 'bg-slate-900 border border-slate-700 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl' },
          h('h3', { className: 'text-lg font-semibold text-white border-b border-slate-800 pb-2' }, 'Yeni Partner Personeli Davet Et'),
          inviteResult &&
            h(
              'div',
              { className: 'p-4 bg-amber-950/60 border border-amber-500/50 rounded-lg space-y-3 text-xs' },
              h(
                'div',
                { className: 'flex items-start gap-2' },
                h('span', { className: 'text-amber-400 font-bold text-base' }, '⚠️'),
                h(
                  'div',
                  null,
                  h('h4', { className: 'font-semibold text-amber-300' }, 'ÖNEMLİ: Personel Davet Bağlantısı (Yalnızca Bir Kez Gösterilir!)'),
                  h(
                    'p',
                    { className: 'text-amber-200/80 mt-1' },
                    'Bu bağlantı davet edilen personelin hesabını kurması ve şifre belirlemesi içindir. Güvenlik nedeniyle konsolda BİR KEZ gösterilir. Lütfen bağlantıyı kopyalayın ve ilgili kişiye güvenli şekilde iletin.'
                  )
                )
              ),
              h(
                'div',
                { className: 'flex items-center gap-2 pt-2' },
                h('input', {
                  type: 'text',
                  readOnly: true,
                  value: inviteResult.inviteUrl,
                  className: 'flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-emerald-300 select-all',
                }),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => {
                      if (navigator.clipboard) {
                        navigator.clipboard.writeText(inviteResult.inviteUrl);
                        setCopiedInvite(true);
                        setTimeout(() => setCopiedInvite(false), 2000);
                      }
                    },
                    className: 'px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors',
                  },
                  copiedInvite ? '✓ Kopyalandı' : 'Kopyala'
                )
              ),
              h('p', { className: 'text-slate-400' }, `Geçerlilik: ${new Date(inviteResult.expiresAt).toLocaleString('tr-TR')}`)
            ),
          h(
            'form',
            { onSubmit: handleInviteSubmit, className: 'space-y-4 text-xs' },
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'E-posta Adresi *'),
              h('input', {
                type: 'email',
                required: true,
                placeholder: 'staff@example.com',
                value: inviteEmail,
                onChange: (e) => setInviteEmail(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
              })
            ),
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Kullanıcı Adı (İsteğe Bağlı)'),
              h('input', {
                type: 'text',
                placeholder: 'örn. pstaff_ali',
                value: inviteUsername,
                onChange: (e) => setInviteUsername(e.target.value),
                className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
              })
            ),
            h(
              'div',
              null,
              h('label', { className: 'block font-medium text-slate-300 mb-1' }, 'Atanacak Rol *'),
              h(
                'select',
                {
                  value: inviteRole,
                  onChange: (e) => setInviteRole(e.target.value),
                  className: 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white',
                },
                PARTNER_ROLES.map((r) => h('option', { key: r.name, value: r.name }, r.displayName))
              )
            ),
            h(
              'div',
              { className: 'flex justify-end gap-2 pt-3 border-t border-slate-800' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setInviteModalOpen(false),
                  className: 'px-4 py-2 text-slate-300 bg-slate-800 hover:bg-slate-700 rounded',
                },
                'Kapat'
              ),
              h(
                'button',
                {
                  type: 'submit',
                  disabled: inviteLoading,
                  className: 'px-5 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:opacity-50',
                },
                inviteLoading ? 'Davet Üretiliyor...' : 'Davet Bağlantısı Üret'
              )
            )
          )
        )
      )
  );
}
