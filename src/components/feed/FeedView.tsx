import {
  Camera,
  Film,
  Globe,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl, uploadMediaBlob } from '../../lib/media';
import { createPost } from '../../services/firestoreService';
import type {
  NavTab,
  Post,
  UserPublicProfile,
} from '../../types';
import { EmptyState, FeedSkeleton, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';
import { PostCard } from './PostCard';

interface FeedViewProps {
  currentUser: UserPublicProfile;
  posts: Post[];
  users: UserPublicProfile[];
  followingIds: string[];
  blockedUserIds: string[];
  onlineUserIds: Set<string>;
  loadingPosts: boolean;
  onOpenProfile: (uid: string) => void;
  onNavigateTab: (tab: NavTab) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function FeedView({
  currentUser,
  posts,
  users,
  followingIds,
  blockedUserIds,
  onlineUserIds,
  loadingPosts,
  onOpenProfile,
  onNavigateTab,
  onToast,
}: FeedViewProps) {
  const { t } = usePreferences();
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends' | 'media'>('all');

  // Post Composer state
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<'public' | 'friends'>('public');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaType, setMediaType] = useState<'none' | 'image' | 'video'>('none');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const handlePostMediaUpload = async (file: File | undefined, kind: 'image' | 'video') => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      if (kind === 'image') {
        const compressed = await compressImageToDataUrl(file, 1200, 0.8);
        setMediaUrl(compressed);
        setMediaType('image');
      } else {
        const uploadedUrl = await uploadMediaBlob(file);
        setMediaUrl(uploadedUrl);
        setMediaType('video');
      }
    } catch (err) {
      onToast('error', 'Upload failed', err instanceof Error ? err.message : 'Unable to process media.');
    } finally {
      setUploadingMedia(false);
    }
  };

  const handlePublishPost = async (e: FormEvent) => {
    e.preventDefault();
    if ((!caption.trim() && mediaType === 'none') || publishing) return;
    setPublishing(true);
    try {
      await createPost({
        author: currentUser,
        caption,
        mediaUrl: mediaUrl || undefined,
        mediaType,
        audience,
      });
      setCaption('');
      setMediaUrl('');
      setMediaType('none');
      onToast('success', 'Post published', 'Your update is now live on Carrom Hub.');
    } catch {
      onToast('error', 'Could not publish post');
    } finally {
      setPublishing(false);
    }
  };

  const filteredPosts = posts.filter((p) => {
    if (blockedUserIds.includes(p.authorId)) return false;
    if (p.audience === 'friends' && p.authorId !== currentUser.uid && !followingIds.includes(p.authorId)) {
      return false;
    }
    if (feedFilter === 'friends') {
      return p.authorId === currentUser.uid || followingIds.includes(p.authorId);
    }
    if (feedFilter === 'media') {
      return p.mediaType !== 'none';
    }
    return true;
  });

  const suggestedPlayers = users
    .filter((u) => u.uid !== currentUser.uid && !followingIds.includes(u.uid) && !blockedUserIds.includes(u.uid))
    .slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Main Feed Column */}
      <div className="lg:col-span-8 space-y-3.5 min-w-0">
        {/* Compact Create Post Composer */}
        <section className="card-surface rounded-2xl p-3 sm:p-3.5">
          <form onSubmit={handlePublishPost} className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <PlayerAvatar src={currentUser.avatarUrl} name={currentUser.fullName} size="sm" online />
              <textarea
                rows={2}
                maxLength={2000}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder={t('whatsOnMind', { name: currentUser.fullName.split(' ')[0] })}
                className="flex-1 inset-surface rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F] resize-none"
              />
            </div>

            {mediaUrl && (
              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-[#00D68F]/20 bg-slate-100 dark:bg-[#080D0B]">
                <button
                  type="button"
                  onClick={() => {
                    setMediaUrl('');
                    setMediaType('none');
                  }}
                  className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-black/75 text-white flex items-center justify-center hover:bg-black"
                  aria-label="Remove media"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                {mediaType === 'image' ? (
                  <img src={mediaUrl} alt="Upload preview" className="w-full max-h-48 object-cover" />
                ) : (
                  <video src={mediaUrl} controls className="w-full max-h-48" />
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-[#00D68F]/10">
              <div className="flex items-center gap-1.5">
                <label className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium text-slate-700 dark:text-white cursor-pointer inline-flex items-center gap-1.5 transition-colors">
                  <Camera className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                  <span>{t('photo')}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handlePostMediaUpload(e.target.files?.[0], 'image')}
                    className="hidden"
                  />
                </label>

                <label className="min-h-[34px] px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium text-slate-700 dark:text-white cursor-pointer inline-flex items-center gap-1.5 transition-colors">
                  <Film className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                  <span>{t('video')}</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => void handlePostMediaUpload(e.target.files?.[0], 'video')}
                    className="hidden"
                  />
                </label>

                <div className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg inset-surface text-xs text-slate-600 dark:text-[#A5B5AC]">
                  <Globe className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as 'public' | 'friends')}
                    className="bg-transparent text-slate-800 dark:text-white text-xs focus:outline-none"
                    aria-label="Post audience"
                  >
                    <option value="public" className="bg-white dark:bg-[#101A15]">
                      {t('publicAudience')}
                    </option>
                    <option value="friends" className="bg-white dark:bg-[#101A15]">
                      {t('friendsAudience')}
                    </option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={(!caption.trim() && mediaType === 'none') || uploadingMedia || publishing}
                className="min-h-[34px] px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs inline-flex items-center gap-1.5 hover:brightness-110 transition-all disabled:opacity-40 shadow-sm"
              >
                {uploadingMedia || publishing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                <span>{uploadingMedia ? t('uploading') : t('publishPost')}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Sleek Feed Filter Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/15 shadow-xs">
            {(
              [
                { id: 'all', label: t('allFeed') },
                { id: 'friends', label: t('following') },
                { id: 'media', label: t('shotsAndVideos') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFeedFilter(tab.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  feedFilter === tab.id
                    ? 'bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-slate-500 dark:text-[#A5B5AC] tabular-nums hidden sm:inline">
            {filteredPosts.length}
          </span>
        </div>

        {/* Compact Posts Feed */}
        {loadingPosts ? (
          <FeedSkeleton />
        ) : filteredPosts.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="w-5 h-5" />}
            title={t('noPostsYet')}
            description={t('noPostsDesc')}
          />
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
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
      </div>

      {/* Right Rail (Desktop) */}
      <aside className="hidden lg:block lg:col-span-4 space-y-4 sticky top-20">
        {/* Suggested Players */}
        <div className="card-surface rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-display font-semibold text-slate-900 dark:text-white">
              {t('suggestedStrikers')}
            </h3>
            <button
              onClick={() => onNavigateTab('explore')}
              className="text-xs text-[#00A86B] dark:text-[#00D68F] hover:underline font-medium"
            >
              {t('viewAll')}
            </button>
          </div>
          {suggestedPlayers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('connectedAll')}</p>
          ) : (
            <div className="space-y-2.5">
              {suggestedPlayers.map((player) => (
                <div key={player.uid} className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenProfile(player.uid)}
                    className="flex items-center gap-2 min-w-0 text-left group"
                  >
                    <PlayerAvatar
                      src={player.avatarUrl}
                      name={player.fullName}
                      size="sm"
                      online={onlineUserIds.has(player.uid)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-[#00A86B] dark:group-hover:text-[#00D68F] truncate flex items-center gap-1">
                        {player.fullName}
                        {player.isVerified && <VerifiedIcon className="w-3.5 h-3.5" />}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">@{player.username}</p>
                    </div>
                  </button>
                  <button
                    onClick={() => onOpenProfile(player.uid)}
                    className="px-2.5 py-1 rounded-lg bg-[#00A86B]/10 dark:bg-[#00D68F]/10 hover:bg-[#00A86B]/20 dark:hover:bg-[#00D68F]/20 text-[#00A86B] dark:text-[#00D68F] text-[11px] font-medium whitespace-nowrap"
                  >
                    {t('profileBtn')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
