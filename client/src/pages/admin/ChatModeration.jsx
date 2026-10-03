import { useEffect, useState, useCallback } from 'react';
import api from '../../services/api';
import { useTranslation } from '../../i18n';
import AdminPageHeader, { ADMIN_BTN, ADMIN_BTN_PRIMARY } from '../../components/admin/AdminPageHeader.jsx';
import { useFormatters } from '../../i18n/useFormatters.jsx';

function moderationAction(action) {
  const value = String(action || '').toLowerCase();
  if (value.includes('unban')) return 'unban';
  if (value.includes('unmute')) return 'unmute';
  if (value.includes('ban')) return 'ban';
  if (value.includes('mute')) return 'mute';
  if (value.includes('delete')) return 'delete';
  return 'other';
}

function moderationUserId(log) {
  return log?.metadata?.userId || log?.after?.userId || log?.userId || log?.targetUserId || '';
}

function moderationMessageId(log) {
  return log?.metadata?.messageId || log?.targetId || log?.messageId || '';
}

export default function ChatModeration() {
  const { t, locale } = useTranslation();
  const fmt = useFormatters();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [moderationLogs, setModerationLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', icon: '', color: '', isPublic: true, minLevel: 0, maxUsers: 100, slowMode: 0 });
  const [banForm, setBanForm] = useState({ userId: '' });
  const [muteForm, setMuteForm] = useState({ userId: '', duration: 300, reason: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState('');

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/chat/admin/rooms');
      setRooms(Array.isArray(data) ? data : data?.rooms || []);
    } catch {
      setRooms([]);
      setNotice({ type: 'error', text: t('common.error') });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  async function loadModeration(roomId) {
    setSelectedRoom(roomId);
    setLogsLoading(true);
    try {
      const { data } = await api.get(`/chat/admin/rooms/${roomId}/moderation`);
      setModerationLogs(Array.isArray(data) ? data : data?.logs || []);
    } catch {
      setModerationLogs([]);
      setNotice({ type: 'error', text: t('common.error') });
    } finally {
      setLogsLoading(false);
    }
  }

  function openCreate() {
    setForm({ name: '', description: '', icon: '', color: '', isPublic: true, minLevel: 0, maxUsers: 100, slowMode: 0 });
    setModal('create');
  }

  function openEdit(room) {
    setForm({
      name: room.name || '',
      description: room.description || '',
      icon: room.icon || '',
      color: room.color || '',
      isPublic: room.isPublic !== false,
      minLevel: room.minLevel || 0,
      maxUsers: room.maxUsers ?? 100,
      slowMode: room.slowMode || 0,
    });
    setModal(room);
  }

  async function saveRoom() {
    setSaving(true);
    setNotice(null);
    try {
      if (modal === 'create') {
        await api.post('/chat/admin/rooms', form);
      } else {
        await api.patch(`/chat/admin/rooms/${modal._id}`, form);
      }
      setNotice({ type: 'ok', text: t('admin.chat.saved') });
      setModal(null);
      loadRooms();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.saveFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRoom(id) {
    if (!confirm(t('admin.chat.confirmDelete'))) return;
    setNotice(null);
    try {
      await api.delete(`/chat/admin/rooms/${id}`);
      if (selectedRoom === id) {
        setSelectedRoom(null);
        setModerationLogs([]);
      }
      setNotice({ type: 'ok', text: t('admin.chat.deleted') });
      loadRooms();
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.deleteFailed') });
    }
  }

  async function banUser(roomId) {
    if (!banForm.userId.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.post(`/chat/admin/rooms/${roomId}/ban`, { userId: banForm.userId.trim() });
      setNotice({ type: 'ok', text: t('admin.chat.userBanned') });
      setBanForm({ userId: '' });
      if (selectedRoom === roomId) loadModeration(roomId);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.banFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function unbanUser(roomId, userId) {
    setNotice(null);
    try {
      await api.delete(`/chat/admin/rooms/${roomId}/ban/${userId}`);
      setNotice({ type: 'ok', text: t('admin.chat.userUnbanned') });
      if (selectedRoom === roomId) loadModeration(roomId);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.unbanFailed') });
    }
  }

  async function muteUser(roomId) {
    if (!muteForm.userId.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.post(`/chat/admin/rooms/${roomId}/mute`, {
        userId: muteForm.userId.trim(),
        duration: Number(muteForm.duration) || 300,
        reason: muteForm.reason || undefined,
      });
      setNotice({ type: 'ok', text: t('admin.chat.userMuted') });
      setMuteForm({ userId: '', duration: 300, reason: '' });
      if (selectedRoom === roomId) loadModeration(roomId);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.muteFailed') });
    } finally {
      setSaving(false);
    }
  }

  async function unmuteUser(roomId, userId) {
    setNotice(null);
    try {
      await api.delete(`/chat/admin/rooms/${roomId}/mute/${userId}`);
      setNotice({ type: 'ok', text: t('admin.chat.userUnmuted') });
      if (selectedRoom === roomId) loadModeration(roomId);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.unmuteFailed') });
    }
  }

  async function deleteMessage(msgId) {
    if (!confirm(t('admin.chat.confirmDeleteMessage'))) return;
    setNotice(null);
    try {
      await api.delete(`/chat/admin/messages/${msgId}`);
      setNotice({ type: 'ok', text: t('admin.chat.messageDeleted') });
      if (selectedRoom) loadModeration(selectedRoom);
    } catch (e) {
      setNotice({ type: 'error', text: e.response?.data?.error?.message || t('admin.chat.deleteMessageFailed') });
    }
  }

  const searchTerm = search.trim().toLowerCase();
  const filtered = rooms.filter(r =>
    !searchTerm
    || String(r.name || '').toLowerCase().includes(searchTerm)
    || String(r.slug || '').toLowerCase().includes(searchTerm)
  );
  const roomModalOpen = modal === 'create' || !!modal?._id;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6">
      <AdminPageHeader
        crumbs={[{ label: t('admin.nav.groupEngagement') }, { label: t('admin.chat.title') }]}
        title={t('admin.chat.title')}
        actions={(
          <button onClick={openCreate} className={ADMIN_BTN_PRIMARY}>
            <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">add</span>
            {t('admin.chat.createRoom')}
          </button>
        )}
      />

      {notice && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
          notice.type === 'ok' ? 'border-success/30 bg-success/15 text-success' : 'border-danger/30 bg-danger/15 text-danger'
        }`}>
          {notice.text}
        </div>
      )}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="flex h-9 min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-white/10 bg-bg-card px-3 text-text-3 sm:max-w-[300px]">
          <span className="material-symbols-outlined !text-[16px] opacity-75" aria-hidden="true">search</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('admin.chat.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text-1 outline-none placeholder:text-text-3"
          />
        </label>
        <button
          type="button"
          onClick={() => setSearch('')}
          className="ml-auto inline-flex items-center gap-1.5 text-[13px] font-bold text-text-3 transition hover:text-text-1"
        >
          <span className="material-symbols-outlined !text-[15px]" aria-hidden="true">close</span>
          {t('common.reset')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-bg-card">
          <div className="mb-3 flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
              <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">chat</span>
            </span>
            <h3 className="text-sm font-extrabold text-text-1">{t('admin.chat.roomsList')}</h3>
            <span className="rounded-full bg-white/10 px-2 py-[3px] font-mono text-[11px] font-bold tabular-nums text-text-2">
              {filtered.length.toLocaleString(locale)}
            </span>
          </div>
          <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-10 text-center text-sm text-text-3">{t('common.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">forum</span>
                <div className="mt-2 text-sm text-text-3">{t('admin.chat.noRooms')}</div>
              </div>
            ) : filtered.map(room => (
              <div
                key={room._id}
                role="button"
                tabIndex={0}
                onClick={() => loadModeration(room._id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') loadModeration(room._id); }}
                className={`cursor-pointer px-4 py-3 transition hover:bg-bg-hover/50 ${
                  selectedRoom === room._id ? 'border-l-2 border-primary bg-primary/10' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {room.icon && /^[a-z][a-z0-9_]*$/.test(room.icon) ? (
                      <span className="material-symbols-outlined !text-[18px]" aria-hidden="true">{room.icon}</span>
                    ) : room.icon ? (
                      room.icon
                    ) : (
                      <span className="material-symbols-outlined !text-[18px] text-text-3" aria-hidden="true">chat</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-1">{room.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${room.isActive !== false ? 'bg-success/15 text-success' : 'bg-danger/20 text-danger'}`}>
                    {room.isActive !== false ? t('common.active') : t('admin.agents.inactive')}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px] text-[10.5px] font-bold text-text-3">
                    {room.slowMode ? `${fmt.formatNumber(room.slowMode)}s` : t('admin.chat.noSlowMode')}
                  </span>
                  {room.minLevel > 0 && (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-[3px] text-[10.5px] font-bold text-text-3">
                      {t('admin.chat.fieldMinLevel')}: {fmt.formatNumber(room.minLevel)}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); openEdit(room); }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2.5 text-xs font-bold text-text-2 transition hover:text-text-1"
                    >
                      <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">edit</span>
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); deleteRoom(room._id); }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"
                    >
                      <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">delete</span>
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-bg-card md:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">history</span>
              </span>
              <h3 className="truncate text-sm font-extrabold text-text-1">
                {selectedRoom ? t('admin.chat.moderationHistory') : t('admin.chat.selectRoom')}
              </h3>
            </div>
            {selectedRoom && (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setModal('ban')}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2.5 text-xs font-bold text-danger transition hover:bg-danger/20"
                >
                  <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">block</span>
                  {t('admin.chat.ban')}
                </button>
                <button
                  onClick={() => setModal('mute')}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-warning/25 bg-warning/10 px-2.5 text-xs font-bold text-warning transition hover:bg-warning/20"
                >
                  <span className="material-symbols-outlined !text-[14px]" aria-hidden="true">volume_off</span>
                  {t('admin.chat.mute')}
                </button>
              </div>
            )}
          </div>
          <div className="max-h-[460px] overflow-y-auto">
            {!selectedRoom ? (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">history</span>
                <div className="mt-2 text-sm text-text-3">{t('admin.chat.selectRoomHint')}</div>
              </div>
            ) : logsLoading ? (
              <div className="px-4 py-10 text-center text-sm text-text-3">{t('common.loading')}</div>
            ) : moderationLogs.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <span className="material-symbols-outlined !text-[32px] text-text-3/60" aria-hidden="true">rule</span>
                <div className="mt-2 text-sm text-text-3">{t('admin.chat.noModerationLogs')}</div>
              </div>
            ) : moderationLogs.map((log, i) => {
              const action = moderationAction(log.action);
              const userId = moderationUserId(log);
              const messageId = moderationMessageId(log);
              const actor = log.actorUsername || log.actorId?.username || log.moderator;
              const target = log.targetUser || userId || '—';
              const duration = log.metadata?.duration || log.duration;
              return (
                <div key={log._id || i} className="border-b border-white/5 px-4 py-3 transition hover:bg-bg-hover/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-[3px] text-[10.5px] font-extrabold uppercase ${
                        action === 'ban' ? 'bg-danger/20 text-danger' :
                        action === 'mute' ? 'bg-warning/20 text-warning' :
                        action === 'delete' ? 'bg-info/15 text-info' :
                        'bg-white/10 text-text-2'
                      }`}>
                        {log.action || '—'}
                      </span>
                      <span className="max-w-full truncate text-xs font-medium text-text-1">{target}</span>
                      {actor && (
                        <span className="text-[10px] text-text-3">
                          {t('admin.chat.moderatorLabel')}: {actor}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-text-3">{log.createdAt ? fmt.formatDateTime(log.createdAt) : '—'}</span>
                  </div>
                  {log.reason && <div className="mt-1 text-[10px] text-text-3">{t('admin.chat.reason')}: {log.reason}</div>}
                  {duration != null && <div className="mt-0.5 text-[10px] text-text-3">{t('admin.chat.duration')}: {fmt.formatNumber(duration)}s</div>}
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {action === 'ban' && userId && (
                      <button
                        type="button"
                        onClick={() => unbanUser(selectedRoom, userId)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2 text-[10.5px] font-bold text-text-2 transition hover:text-text-1"
                      >
                        <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">person_cancel</span>
                        {t('common.remove')}
                      </button>
                    )}
                    {action === 'mute' && userId && (
                      <button
                        type="button"
                        onClick={() => unmuteUser(selectedRoom, userId)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/10 bg-bg-hover px-2 text-[10.5px] font-bold text-text-2 transition hover:text-text-1"
                      >
                        <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">volume_up</span>
                        {t('common.remove')}
                      </button>
                    )}
                    {action === 'delete' && messageId && (
                      <button
                        type="button"
                        onClick={() => deleteMessage(messageId)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-danger/25 bg-danger/10 px-2 text-[10.5px] font-bold text-danger transition hover:bg-danger/20"
                      >
                        <span className="material-symbols-outlined !text-[13px]" aria-hidden="true">delete</span>
                        {t('admin.chat.deleteMessage')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {(roomModalOpen || modal === 'ban' || modal === 'mute') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-bg-card border border-white/10 rounded-xl w-full max-w-md p-6">
            {roomModalOpen && (
              <>
                <h2 className="mb-4 text-base font-extrabold text-text-1">
                  {modal === 'create' ? t('admin.chat.createRoomTitle') : t('admin.chat.editTitle')}
                </h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldName')}</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldDescription')}</label>
                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldIcon')}</label>
                      <input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} placeholder={t('admin.chat.iconPlaceholder')}
                        className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldColor')}</label>
                      <input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#8b5cf6"
                        className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldMinLevel')}</label>
                      <input type="number" value={form.minLevel} onChange={e => setForm(f => ({ ...f, minLevel: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldSlowMode')}</label>
                      <input type="number" value={form.slowMode} onChange={e => setForm(f => ({ ...f, slowMode: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldMaxUsers')}</label>
                      <input type="number" value={form.maxUsers} onChange={e => setForm(f => ({ ...f, maxUsers: Number(e.target.value) }))}
                        className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-text-3">
                    <input type="checkbox" checked={form.isPublic} onChange={e => setForm(f => ({ ...f, isPublic: e.target.checked }))} className="rounded" />
                    {t('admin.chat.fieldPublic')}
                  </label>
                </div>
              </>
            )}

            {modal === 'ban' && (
              <>
                <h2 className="mb-4 text-base font-extrabold text-text-1">{t('admin.chat.banTitle')}</h2>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldUserId')}</label>
                  <input value={banForm.userId} onChange={e => setBanForm(f => ({ ...f, userId: e.target.value }))}
                    className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none"
                    placeholder={t('admin.chat.fieldUserId')} />
                </div>
              </>
            )}

            {modal === 'mute' && (
              <>
                <h2 className="mb-4 text-base font-extrabold text-text-1">{t('admin.chat.muteTitle')}</h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldUserId')}</label>
                    <input value={muteForm.userId} onChange={e => setMuteForm(f => ({ ...f, userId: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none"
                      placeholder={t('admin.chat.fieldUserId')} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldDurationSeconds')}</label>
                    <input type="number" value={muteForm.duration} onChange={e => setMuteForm(f => ({ ...f, duration: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-3">{t('admin.chat.fieldReason')}</label>
                    <input value={muteForm.reason} onChange={e => setMuteForm(f => ({ ...f, reason: e.target.value }))}
                      className="w-full rounded-lg border border-white/10 bg-bg-deep px-3 py-2 text-sm text-text-1 focus:border-white/25 focus:outline-none" />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setModal(null)} className={ADMIN_BTN}>
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  if (roomModalOpen) saveRoom();
                  else if (modal === 'ban' && selectedRoom) banUser(selectedRoom);
                  else if (modal === 'mute' && selectedRoom) muteUser(selectedRoom);
                }}
                disabled={saving || (roomModalOpen && !form.name.trim())}
                className={`${ADMIN_BTN_PRIMARY} disabled:opacity-50`}
              >
                <span className="material-symbols-outlined !text-[16px]" aria-hidden="true">save</span>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
