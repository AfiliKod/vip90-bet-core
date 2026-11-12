import React, { useState, useEffect } from 'react';
import apiClient from '../api/client.js';

const h = React.createElement;

export default function WriteGrantModal({ isOpen, onClose, tenantId, onGrantIssued }) {
  const [staffList, setStaffList] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [durationHours, setDurationHours] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setReason('');
      setDurationHours(1);
      // Fetch platform staff accounts for selection
      apiClient
        .get('/staff')
        .then((res) => {
          const staff = res.data?.staff || [];
          setStaffList(staff);
          if (staff.length > 0 && !staffId) {
            setStaffId(staff[0]._id);
          }
        })
        .catch(() => {
          // If staff list fetch fails (e.g. permission), staffId can be entered manually
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!staffId || !String(staffId).trim()) {
      setError('Personel hesabı seçilmelidir.');
      return;
    }

    if (!reason || !String(reason).trim()) {
      setError('Yazma izni gerekçesi (nedeni) zorunludur.');
      return;
    }

    const hours = Number(durationHours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      setError('Geçerli bir süre girin (en fazla 24 saat).');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/write-grants`, {
        staffId: String(staffId).trim(),
        reason: String(reason).trim(),
        durationHours: hours,
      });
      if (onGrantIssued) {
        onGrantIssued(res.data?.grant);
      }
      onClose();
    } catch (err) {
      if (err.response?.status === 403) {
        setError('Yetki Hatası: Yalnızca Platform Sahibi (Platform Owner) yazma izni verebilir.');
      } else {
        const msg =
          err.response?.data?.error?.message ||
          err.response?.data?.message ||
          'Yazma izni oluşturulurken bir hata oluştu.';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return h(
    'div',
    { className: 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm' },
    h(
      'div',
      { className: 'bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden' },
      h(
        'div',
        { className: 'px-6 py-4 border-b border-slate-800 flex justify-between items-center' },
        h(
          'div',
          null,
          h('h3', { className: 'text-lg font-semibold text-white' }, 'K23 Yazma İzni Talebi (Write Grant)'),
          h('p', { className: 'text-xs text-amber-400 mt-0.5' }, 'Yalnızca Platform Sahibi (Platform Owner) yetkilidir')
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: onClose,
            className: 'text-slate-400 hover:text-white text-lg font-bold p-1',
          },
          '✕'
        )
      ),
      h(
        'form',
        { onSubmit: handleSubmit, className: 'p-6 space-y-4' },
        error &&
          h(
            'div',
            { className: 'p-3 bg-rose-950/60 border border-rose-500/40 rounded-md text-xs text-rose-300' },
            error
          ),
        h(
          'div',
          { className: 'p-3 bg-amber-950/40 border border-amber-500/30 rounded-md text-xs text-amber-300' },
          'Platform personeli varsayılan olarak operatör verilerinde yalnızca okuma (read-only) yetkisine sahiptir. Yazma işlemleri için süreli ve denetime tabi bir istisna izni gereklidir (K23).'
        ),
        h(
          'div',
          null,
          h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Personel Hesabı'),
          staffList.length > 0
            ? h(
                'select',
                {
                  value: staffId,
                  onChange: (e) => setStaffId(e.target.value),
                  className:
                    'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
                },
                staffList.map((s) =>
                  h(
                    'option',
                    { key: s._id, value: s._id },
                    `${s.username || s.email} (${s.email})`
                  )
                )
              )
            : h('input', {
                type: 'text',
                required: true,
                value: staffId,
                onChange: (e) => setStaffId(e.target.value),
                placeholder: 'Personel ID (örn. MongoDB ObjectId)',
                className:
                  'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
              })
        ),
        h(
          'div',
          null,
          h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'İzin Süresi (Saat, azami 24 saat)'),
          h('input', {
            type: 'number',
            required: true,
            min: 1,
            max: 24,
            value: durationHours,
            onChange: (e) => setDurationHours(e.target.value),
            className:
              'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
          })
        ),
        h(
          'div',
          null,
          h('label', { className: 'block text-xs font-medium text-slate-300 mb-1' }, 'Yazma Gerekçesi (Zorunlu)'),
          h('textarea', {
            required: true,
            rows: 3,
            value: reason,
            onChange: (e) => setReason(e.target.value),
            placeholder: 'Operatör üzerinde yapılacak işlemin gerekçesi ve bilet/talep referansı...',
            className:
              'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-md text-sm text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500',
          })
        ),
        h(
          'div',
          { className: 'flex justify-end gap-3 pt-4 border-t border-slate-800' },
          h(
            'button',
            {
              type: 'button',
              onClick: onClose,
              className: 'px-4 py-2 text-sm text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors',
            },
            'İptal'
          ),
          h(
            'button',
            {
              type: 'submit',
              disabled: loading,
              className: 'px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-sm transition-colors disabled:opacity-50',
            },
            loading ? 'İşleniyor...' : 'Yazma İzni Oluştur'
          )
        )
      )
    )
  );
}
