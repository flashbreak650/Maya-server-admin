import {
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  MessageCircle,
  MessageSquare,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { usePreferences } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/media';
import { markAllNotificationsRead, markNotificationRead } from '../../services/firestoreService';
import type { AppNotification, NavTab } from '../../types';
import { EmptyState, PlayerAvatar } from '../ui/ToastAndDialogs';

interface NotificationsViewProps {
  notifications: AppNotification[];
  onNavigateNotification: (n: AppNotification) => void;
}

export function NotificationsView({ notifications, onNavigateNotification }: NotificationsViewProps) {
  const { t } = usePreferences();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'follow':
        return <UserPlus className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />;
      case 'like':
        return <Heart className="w-4 h-4 text-rose-500 dark:text-rose-400" />;
      case 'comment':
        return <MessageCircle className="w-4 h-4 text-sky-500 dark:text-sky-400" />;
      case 'message':
        return <MessageSquare className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />;
      case 'group_invite':
        return <Users className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
      case 'tournament':
        return <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400" />;
      default:
        return <AtSign className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('notifications')}</h1>
          <p className="text-sm text-slate-500 dark:text-[#A5B5AC] mt-1 tabular-nums">
            {unreadCount > 0 ? t('unreadUpdates', { count: String(unreadCount) }) : t('allCaughtUp')}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => void markAllNotificationsRead(notifications)}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium text-[#008F5B] dark:text-[#00D68F] inline-flex items-center gap-1.5 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {t('markAllRead')}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-6 h-6" />}
          title={t('noNotificationsYet')}
          description={t('noNotificationsDesc')}
        />
      ) : (
        <div className="card-surface rounded-2xl divide-y divide-slate-200 dark:divide-[#00D68F]/10 overflow-hidden">
          {notifications.map((n) => (
            <button
              key={n.id}
              onClick={async () => {
                if (!n.read) await markNotificationRead(n.id);
                onNavigateNotification(n);
              }}
              className={`w-full p-4 flex items-start gap-3.5 text-left transition-colors ${
                n.read
                  ? 'hover:bg-slate-50 dark:hover:bg-white/5'
                  : 'bg-[#00A86B]/6 hover:bg-[#00A86B]/10 dark:bg-[#00D68F]/8 dark:hover:bg-[#00D68F]/12'
              }`}
            >
              <PlayerAvatar src={n.actorAvatar} name={n.actorName} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{n.title}</p>
                  <span className="text-[11px] text-slate-500 dark:text-[#A5B5AC] shrink-0">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] mt-0.5 leading-relaxed">{n.body}</p>
              </div>
              <div className="h-8 w-8 rounded-xl inset-surface flex items-center justify-center shrink-0">
                {getIcon(n.type)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

void (0 as unknown as NavTab);
