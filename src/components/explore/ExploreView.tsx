import { Flame, Search, Sparkles, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { usePreferences } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/media';
import type { Post, UserPublicProfile } from '../../types';
import { PostCard } from '../feed/PostCard';
import { EmptyState, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';

interface ExploreViewProps {
  currentUser: UserPublicProfile;
  users: UserPublicProfile[];
  posts: Post[];
  followingIds: string[];
  blockedUserIds: string[];
  onlineUserIds: Set<string>;
  initialQuery?: string;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function ExploreView({
  currentUser,
  users,
  posts,
  followingIds,
  blockedUserIds,
  onlineUserIds,
  initialQuery = '',
  onOpenProfile,
  onToast,
}: ExploreViewProps) {
  const { t } = usePreferences();
  const [queryText, setQueryText] = useState(initialQuery);
  const [section, setSection] = useState<'all' | 'players' | 'posts'>('all');

  const q = queryText.trim().toLowerCase();

  const visibleUsers = users.filter(
    (u) =>
      !blockedUserIds.includes(u.uid) &&
      (!q ||
        u.fullName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.carromPlayerId || '').toLowerCase().includes(q))
  );

  const popularPlayers = [...visibleUsers].sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
  const suggestedFriends = visibleUsers.filter(
    (u) => u.uid !== currentUser.uid && !followingIds.includes(u.uid)
  );
  const newMembers = [...visibleUsers].sort((a, b) => {
    const aMs = typeof a.createdAt === 'object' && a.createdAt && 'toMillis' in a.createdAt ? (a.createdAt as { toMillis: () => number }).toMillis() : 0;
    const bMs = typeof b.createdAt === 'object' && b.createdAt && 'toMillis' in b.createdAt ? (b.createdAt as { toMillis: () => number }).toMillis() : 0;
    return bMs - aMs;
  });

  const trendingPosts = posts
    .filter(
      (p) =>
        !blockedUserIds.includes(p.authorId) &&
        p.audience === 'public' &&
        (!q || p.caption.toLowerCase().includes(q) || p.authorName.toLowerCase().includes(q))
    )
    .sort((a, b) => (b.likesCount + b.commentsCount * 2) - (a.likesCount + a.commentsCount * 2));

  return (
    <div className="space-y-6">
      {/* Search & Filter Header */}
      <section className="card-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('exploreTitle')}</h1>
            <p className="text-sm text-slate-600 dark:text-[#A5B5AC] mt-1">{t('exploreSub')}</p>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: t('allDiscovery') },
              { id: 'players', label: t('playersTab') },
              { id: 'posts', label: t('trendingPosts') },
            ] as const
          ).map((tabItem) => (
            <button
              key={tabItem.id}
              onClick={() => setSection(tabItem.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                section === tabItem.id
                  ? 'bg-[#00D68F] text-[#080D0B] font-semibold'
                  : 'inset-surface text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      </section>

      {/* Popular Players & Suggested Friends */}
      {(section === 'all' || section === 'players') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card-surface rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                {t('popularPlayers')}
              </h2>
              <span className="text-xs text-slate-500 dark:text-[#A5B5AC] tabular-nums">{popularPlayers.length} found</span>
            </div>
            {popularPlayers.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">No matching players found.</p>
            ) : (
              <div className="space-y-3">
                {popularPlayers.slice(0, 6).map((player) => (
                  <button
                    key={player.uid}
                    onClick={() => onOpenProfile(player.uid)}
                    className="w-full p-3 rounded-xl inset-surface hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar
                        src={player.avatarUrl}
                        name={player.fullName}
                        online={onlineUserIds.has(player.uid)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                          {player.fullName}
                          {player.isVerified && <VerifiedIcon className="w-3.5 h-3.5" />}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#A5B5AC] truncate">
                          @{player.username}
                          {player.carromPlayerId ? ` · ID ${player.carromPlayerId}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-[#008F5B] dark:text-[#00D68F] tabular-nums shrink-0">
                      {player.followersCount} {t('followersLabel').toLowerCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="card-surface rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                {t('suggestedFriends')}
              </h2>
              {suggestedFriends.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('connectedAll')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suggestedFriends.slice(0, 4).map((p) => (
                    <button
                      key={p.uid}
                      onClick={() => onOpenProfile(p.uid)}
                      className="p-3 rounded-xl inset-surface hover:border-[#00A86B]/40 dark:hover:border-[#00D68F]/30 text-left flex items-center gap-2.5 transition-colors"
                    >
                      <PlayerAvatar src={p.avatarUrl} name={p.fullName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{p.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">@{p.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="card-surface rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                {t('newMembers')}
              </h2>
              <div className="space-y-2.5">
                {newMembers.slice(0, 4).map((m) => (
                  <button
                    key={m.uid}
                    onClick={() => onOpenProfile(m.uid)}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl inset-surface hover:bg-slate-100 dark:hover:bg-white/5 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={m.avatarUrl} name={m.fullName} size="xs" />
                      <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{m.fullName}</span>
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-[#A5B5AC] shrink-0">
                      {formatRelativeTime(m.createdAt)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Trending Posts */}
      {(section === 'all' || section === 'posts') && (
        <section className="space-y-4">
          <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">{t('trendingPosts')}</h2>
          {trendingPosts.length === 0 ? (
            <EmptyState
              icon={<Search className="w-6 h-6" />}
              title="No trending posts found"
              description="Try adjusting your search keywords or share a public Carrom post."
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {trendingPosts.slice(0, 8).map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  isOnline={onlineUserIds.has(post.authorId)}
                  onOpenProfile={onOpenProfile}
                  onToast={onToast}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
