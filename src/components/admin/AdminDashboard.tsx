import {
  Activity,
  BadgeCheck,
  Ban,
  Flag,
  Loader2,
  PauseCircle,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { auth } from '../../lib/firebase';
import { formatRelativeTime } from '../../lib/media';
import {
  adminDeletePost,
  adminResolveReport,
  adminSavePlatformSettings,
  adminUpdateUserModeration,
  fetchAllUsersForAdmin,
  subscribeToReports,
} from '../../services/firestoreService';
import type {
  PlatformSettings,
  Post,
  ReportRecord,
  UserPublicProfile,
} from '../../types';
import { EmptyState, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';

interface AdminDashboardProps {
  currentUser: UserPublicProfile;
  posts: Post[];
  platformSettings: PlatformSettings | null;
  onlineUserIds: Set<string>;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

interface AuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  timestamp: string;
}

export function AdminDashboard({
  currentUser,
  posts,
  platformSettings,
  onlineUserIds,
  onToast,
}: AdminDashboardProps) {
  const [serverVerified, setServerVerified] = useState<'loading' | 'authorized' | 'denied'>('loading');
  const [adminRole, setAdminRole] = useState<string>('player');
  const [adminTab, setAdminTab] = useState<'users' | 'posts' | 'reports' | 'settings' | 'audit'>('users');

  const [allUsers, setAllUsers] = useState<UserPublicProfile[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);

  // Settings state
  const [maintenanceMode, setMaintenanceMode] = useState(platformSettings?.maintenanceMode ?? false);
  const [allowRegistrations, setAllowRegistrations] = useState(platformSettings?.allowRegistrations ?? true);
  const [allowTournamentCreation, setAllowTournamentCreation] = useState(
    platformSettings?.allowTournamentCreation ?? true
  );
  const [announcementBanner, setAnnouncementBanner] = useState(platformSettings?.announcementBanner ?? '');
  const [savingSettings, setSavingSettings] = useState(false);

  // Server-side verification on mount
  useEffect(() => {
    let active = true;
    async function verifyServerAdmin() {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          if (active) setServerVerified('denied');
          return;
        }
        const res = await fetch('/api/admin/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (active) setServerVerified('denied');
          return;
        }
        const data = (await res.json()) as { isAdmin: boolean; role: string };
        if (!active) return;
        if (data.isAdmin) {
          setAdminRole(data.role);
          setServerVerified('authorized');
        } else {
          setServerVerified('denied');
        }
      } catch {
        if (active) setServerVerified('denied');
      }
    }
    void verifyServerAdmin();
    return () => {
      active = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    if (serverVerified !== 'authorized') return;
    void fetchAllUsersForAdmin().then(setAllUsers).catch(() => undefined);
    const unsubReports = subscribeToReports(setReports);

    async function loadLogs() {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { logs: AuditEntry[] };
        setAuditLogs(data.logs || []);
      }
    }
    void loadLogs();

    return () => unsubReports();
  }, [serverVerified]);

  if (serverVerified === 'loading') {
    return (
      <div className="card-surface rounded-3xl p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-[#00A86B] dark:text-[#00D68F] animate-spin" />
        <p className="text-sm text-slate-600 dark:text-[#A5B5AC]">Verifying administrator credentials on server...</p>
      </div>
    );
  }

  if (serverVerified === 'denied') {
    return (
      <EmptyState
        icon={<ShieldAlert className="w-6 h-6 text-rose-500 dark:text-rose-400" />}
        title="Access Denied"
        description="Administrator privileges could not be verified by the server. Only authorized platform administrators can access this console."
      />
    );
  }

  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;

  const refreshUsers = async () => {
    const list = await fetchAllUsersForAdmin();
    setAllUsers(list);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await adminSavePlatformSettings(currentUser.uid, {
        maintenanceMode,
        allowRegistrations,
        allowTournamentCreation,
        announcementBanner,
      });
      onToast('success', 'Platform settings saved');
    } catch {
      onToast('error', 'Failed to save platform settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#00A86B] dark:text-[#00D68F]" />
            Admin Control Center
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#A5B5AC] mt-1">
            Server-verified session ({adminRole}) · {currentUser.fullName}
          </p>
        </div>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="card-surface rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">Total Players</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {allUsers.length}
          </p>
        </div>
        <div className="card-surface rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">Active Online</p>
          <p className="text-2xl font-display font-bold text-[#00A86B] dark:text-[#00D68F] mt-1 tabular-nums">
            {onlineUserIds.size}
          </p>
        </div>
        <div className="card-surface rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">Total Posts</p>
          <p className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1 tabular-nums">
            {posts.length}
          </p>
        </div>
        <div className="card-surface rounded-2xl p-4">
          <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">Pending Reports</p>
          <p className="text-2xl font-display font-bold text-amber-500 dark:text-amber-400 mt-1 tabular-nums">
            {pendingReportsCount}
          </p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'users', label: 'Users', icon: Users },
            { id: 'posts', label: 'Posts', icon: Activity },
            { id: 'reports', label: `Reports (${pendingReportsCount})`, icon: Flag },
            { id: 'settings', label: 'Settings', icon: Settings },
            { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setAdminTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                adminTab === t.id
                  ? 'bg-[#00D68F] text-[#080D0B] font-semibold'
                  : 'card-surface text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Users Management */}
      {adminTab === 'users' && (
        <section className="card-surface rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-[#080D0B]/90 text-slate-600 dark:text-[#A5B5AC]">
                <tr>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#00D68F]/10">
                {allUsers.map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar src={u.avatarUrl} name={u.fullName} size="xs" online={onlineUserIds.has(u.uid)} />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1">
                            {u.fullName}
                            {u.isVerified && <VerifiedIcon className="w-3.5 h-3.5" />}
                          </p>
                          <p className="text-slate-500 dark:text-[#A5B5AC]">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#A5B5AC]">
                      {u.isBanned ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium">Banned</span>
                      ) : u.isSuspended ? (
                        <span className="text-amber-600 dark:text-amber-300 font-medium">Suspended</span>
                      ) : (
                        <span className="text-[#008F5B] dark:text-[#00D68F] font-medium">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={async () => {
                            await adminUpdateUserModeration(u, { isVerified: !u.isVerified });
                            await refreshUsers();
                            onToast('success', u.isVerified ? 'Verification removed' : 'Player verified');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#00A86B]/12 dark:bg-[#00D68F]/15 text-[#008F5B] dark:text-[#00D68F] hover:bg-[#00A86B]/20 dark:hover:bg-[#00D68F]/25 inline-flex items-center gap-1"
                        >
                          <BadgeCheck className="w-3.5 h-3.5" />
                          {u.isVerified ? 'Unverify' : 'Verify'}
                        </button>
                        <button
                          onClick={async () => {
                            await adminUpdateUserModeration(u, { isSuspended: !u.isSuspended });
                            await refreshUsers();
                            onToast('info', u.isSuspended ? 'Suspension lifted' : 'Player suspended');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 inline-flex items-center gap-1"
                        >
                          <PauseCircle className="w-3.5 h-3.5" />
                          {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          onClick={async () => {
                            await adminUpdateUserModeration(u, { isBanned: !u.isBanned });
                            await refreshUsers();
                            onToast('info', u.isBanned ? 'Player unbanned' : 'Player banned');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25 inline-flex items-center gap-1"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          {u.isBanned ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Posts Moderation */}
      {adminTab === 'posts' && (
        <section className="card-surface rounded-2xl divide-y divide-slate-200 dark:divide-[#00D68F]/10">
          {posts.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">
                  {p.authorName} (@{p.authorUsername}) · {formatRelativeTime(p.createdAt)}
                </p>
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] truncate mt-1">
                  {p.caption || `[${p.mediaType}]`}
                </p>
              </div>
              <button
                onClick={async () => {
                  await adminDeletePost(p);
                  onToast('success', 'Post removed by admin');
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25 text-xs font-medium inline-flex items-center gap-1 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Reports Queue */}
      {adminTab === 'reports' && (
        <section className="card-surface rounded-2xl divide-y divide-slate-200 dark:divide-[#00D68F]/10">
          {reports.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-[#A5B5AC]">No user reports submitted.</div>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {r.targetType.toUpperCase()} Report · {r.reason}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#A5B5AC] mt-0.5">
                    Target ID: {r.targetId} · Status: <span className="capitalize">{r.status}</span>
                  </p>
                  {r.details && <p className="text-xs text-slate-700 dark:text-[#D5E2DB] mt-1">{r.details}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void adminResolveReport(r.id, 'action_taken')}
                    className="px-3 py-1.5 rounded-lg bg-[#00A86B]/15 dark:bg-[#00D68F]/15 text-[#008F5B] dark:text-[#00D68F] text-xs font-medium"
                  >
                    Action Taken
                  </button>
                  <button
                    onClick={() => void adminResolveReport(r.id, 'dismissed')}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-[#A5B5AC] text-xs font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Platform Settings */}
      {adminTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="card-surface rounded-2xl p-5 space-y-4 max-w-xl">
          <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">Platform Settings</h2>
          <label className="flex items-center justify-between p-3 rounded-xl inset-surface cursor-pointer">
            <span className="text-sm text-slate-900 dark:text-white">Maintenance Mode</span>
            <input
              type="checkbox"
              checked={maintenanceMode}
              onChange={(e) => setMaintenanceMode(e.target.checked)}
              className="accent-[#00D68F]"
            />
          </label>
          <label className="flex items-center justify-between p-3 rounded-xl inset-surface cursor-pointer">
            <span className="text-sm text-slate-900 dark:text-white">Allow New Registrations</span>
            <input
              type="checkbox"
              checked={allowRegistrations}
              onChange={(e) => setAllowRegistrations(e.target.checked)}
              className="accent-[#00D68F]"
            />
          </label>
          <label className="flex items-center justify-between p-3 rounded-xl inset-surface cursor-pointer">
            <span className="text-sm text-slate-900 dark:text-white">Allow Tournament Creation</span>
            <input
              type="checkbox"
              checked={allowTournamentCreation}
              onChange={(e) => setAllowTournamentCreation(e.target.checked)}
              className="accent-[#00D68F]"
            />
          </label>
          <div className="space-y-1.5">
            <label className="text-xs text-slate-600 dark:text-[#A5B5AC]">Global Announcement Banner</label>
            <input
              type="text"
              maxLength={300}
              value={announcementBanner}
              onChange={(e) => setAnnouncementBanner(e.target.value)}
              placeholder="Optional announcement displayed to all players..."
              className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            disabled={savingSettings}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm"
          >
            {savingSettings ? 'Saving...' : 'Save Platform Settings'}
          </button>
        </form>
      )}

      {/* Server Audit Logs */}
      {adminTab === 'audit' && (
        <section className="card-surface rounded-2xl divide-y divide-slate-200 dark:divide-[#00D68F]/10">
          {auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-[#A5B5AC]">
              No administrative actions recorded in this session yet.
            </div>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {log.action} · {log.targetType} ({log.targetId})
                  </p>
                  <p className="text-slate-500 dark:text-[#A5B5AC] mt-0.5">
                    By {log.actorEmail} · {log.details}
                  </p>
                </div>
                <span className="text-slate-400 dark:text-[#64746B] font-mono-tabular shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
