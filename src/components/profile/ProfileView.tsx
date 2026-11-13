import {
  Award,
  Ban,
  Camera,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  Flag,
  Languages,
  Lock,
  LogOut,
  MessageCircle,
  Moon,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl } from '../../lib/media';
import { useAppPermissions, usePWAInstall } from '../../lib/permissions';
import {
  submitReport,
  toggleFollowUser,
  updateUserPrivateSettings,
  updateUserProfile,
} from '../../services/firestoreService';
import type { Post, UserPrivateInfo, UserPublicProfile } from '../../types';
import { PostCard } from '../feed/PostCard';
import { PermissionsModal } from '../ui/PermissionsModal';
import { EmptyState, ModalDialog, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';

interface ProfileViewProps {
  currentUser: UserPublicProfile;
  targetUser: UserPublicProfile;
  privateInfo: UserPrivateInfo | null;
  posts: Post[];
  followingIds: string[];
  onlineUserIds: Set<string>;
  isServerAdmin?: boolean;
  onOpenAdmin?: () => void;
  onSignOut?: () => void;
  onMessageUser: (target: UserPublicProfile) => void;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function ProfileView({
  currentUser,
  targetUser,
  privateInfo,
  posts,
  followingIds,
  onlineUserIds,
  isServerAdmin,
  onOpenAdmin,
  onSignOut,
  onMessageUser,
  onOpenProfile,
  onToast,
}: ProfileViewProps) {
  const { theme, toggleTheme, toggleLang, t } = usePreferences();
  const isActualOwn = currentUser.uid === targetUser.uid;
  const [publicPreview, setPublicPreview] = useState(false);
  const isOwn = isActualOwn && !publicPreview;

  const isFollowing = followingIds.includes(targetUser.uid);
  const blockedIds = privateInfo?.blockedUserIds || [];
  const isBlocked = blockedIds.includes(targetUser.uid);

  const [editOpen, setEditOpen] = useState(false);
  const [fullName, setFullName] = useState(targetUser.fullName);
  const [username, setUsername] = useState(targetUser.username);
  const [bio, setBio] = useState(targetUser.bio || '');
  const [facebookUrl, setFacebookUrl] = useState(targetUser.facebookUrl || '');
  const [tiktokUrl, setTiktokUrl] = useState(targetUser.tiktokUrl || '');
  const [instagramUrl, setInstagramUrl] = useState(targetUser.instagramUrl || '');
  const [avatarUrl, setAvatarUrl] = useState(targetUser.avatarUrl || '');
  const [saving, setSaving] = useState(false);

  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [profilePrivacy, setProfilePrivacy] = useState<'public' | 'friends'>(targetUser.privacy);
  const [showOnlineStatus, setShowOnlineStatus] = useState(privateInfo?.showOnlineStatus ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    privateInfo?.notificationsEnabled ?? true
  );

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Abusive behavior');
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const {
    status: permStatus,
    markReviewed: markPermsReviewed,
    requestMicrophone,
    requestCamera,
    requestNotifications,
  } = useAppPermissions();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  const userPosts = posts.filter((p) => {
    if (p.authorId !== targetUser.uid) return false;
    if (!isOwn && !publicPreview && targetUser.privacy === 'friends' && !isFollowing) return false;
    return true;
  });

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 480, 0.82);
      setAvatarUrl(compressed);
    } catch {
      onToast('error', 'Image processing failed');
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateUserProfile(currentUser.uid, {
        fullName,
        username,
        bio,
        facebookUrl,
        tiktokUrl,
        instagramUrl,
        avatarUrl,
      });
      setEditOpen(false);
      onToast('success', 'Profile updated');
    } catch {
      onToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivacy = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateUserProfile(currentUser.uid, { privacy: profilePrivacy });
      await updateUserPrivateSettings(currentUser.uid, {
        showOnlineStatus,
        notificationsEnabled,
      });
      setPrivacyOpen(false);
      onToast('success', 'Privacy settings saved');
    } catch {
      onToast('error', 'Failed to save privacy settings');
    }
  };

  const handleToggleBlock = async () => {
    const next = isBlocked
      ? blockedIds.filter((id) => id !== targetUser.uid)
      : [...blockedIds, targetUser.uid];
    try {
      await updateUserPrivateSettings(currentUser.uid, { blockedUserIds: next });
      onToast('info', isBlocked ? 'Player unblocked' : 'Player blocked');
    } catch {
      onToast('error', 'Could not update block list');
    }
  };

  const handleReportUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await submitReport({
        reporterId: currentUser.uid,
        targetType: 'user',
        targetId: targetUser.uid,
        reason: reportReason,
      });
      setReportOpen(false);
      onToast('success', 'Player reported to moderators');
    } catch {
      onToast('error', 'Could not submit report');
    }
  };

  const formatSocialLink = (urlOrHandle: string, platform: 'facebook' | 'tiktok' | 'instagram'): string => {
    const raw = urlOrHandle.trim();
    if (!raw) return '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
    const clean = raw.replace(/^@/, '');
    if (platform === 'facebook') return `https://facebook.com/${clean}`;
    if (platform === 'tiktok') return `https://tiktok.com/@${clean}`;
    if (platform === 'instagram') return `https://instagram.com/${clean}`;
    return raw;
  };

  return (
    <div className="space-y-6">
      {/* Public Preview Notice Bar for Owner */}
      {isActualOwn && (
        <div className="flex items-center justify-between px-5 py-3 rounded-2xl bg-gradient-to-r from-[#00A86B]/15 via-[#00A86B]/8 to-transparent dark:from-[#00D68F]/20 dark:via-[#00D68F]/10 border border-[#00A86B]/30 dark:border-[#00D68F]/35">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-slate-900 dark:text-white">
            <Eye className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
            <span>
              {publicPreview ? 'Viewing public preview mode' : 'Manage your Carrom Hub player profile'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPublicPreview((v) => !v)}
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/30 text-xs font-semibold text-[#008F5B] dark:text-[#00D68F] shadow-sm hover:brightness-110 transition-all"
          >
            {publicPreview ? t('backToEditProfile') : t('viewPublicProfile')}
          </button>
        </div>
      )}

      {/* Stunning Modern Profile Card (No Banner as requested) */}
      <section className="card-surface rounded-3xl p-6 sm:p-10 space-y-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 h-64 w-64 bg-gradient-to-br from-[#00A86B]/15 to-transparent dark:from-[#00D68F]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center space-y-4 relative z-10">
          <div className="relative">
            <div className="absolute -inset-1.5 rounded-full bg-gradient-to-r from-[#00D68F] to-[#00B87A] opacity-70 blur-sm" />
            <div className="relative rounded-full p-1 bg-white dark:bg-[#080D0B]">
              <PlayerAvatar
                src={targetUser.avatarUrl}
                name={targetUser.fullName}
                size="xl"
                online={onlineUserIds.has(targetUser.uid)}
              />
            </div>
          </div>

          <div className="space-y-1 max-w-lg">
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 dark:text-white flex items-center justify-center gap-2">
              {targetUser.fullName}
              {targetUser.isVerified && <VerifiedIcon className="w-5 h-5 shrink-0" />}
            </h1>
            <p className="text-sm font-medium text-slate-500 dark:text-[#A5B5AC]">
              @{targetUser.username}
            </p>
          </div>

          {targetUser.bio && (
            <p className="text-sm text-slate-700 dark:text-[#D5E2DB] max-w-md leading-relaxed">
              {targetUser.bio}
            </p>
          )}

          {/* Social Profiles (Facebook, TikTok, Instagram) */}
          {(targetUser.facebookUrl || targetUser.tiktokUrl || targetUser.instagramUrl) && (
            <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
              {targetUser.facebookUrl && (
                <a
                  href={formatSocialLink(targetUser.facebookUrl, 'facebook')}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-[#1877F2]/10 dark:bg-[#1877F2]/15 border border-[#1877F2]/30 text-[#1877F2] dark:text-[#60a5fa] text-xs font-semibold inline-flex items-center gap-2 hover:brightness-110 transition-all"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>Facebook</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              {targetUser.tiktokUrl && (
                <a
                  href={formatSocialLink(targetUser.tiktokUrl, 'tiktok')}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-black/10 dark:bg-white/10 border border-black/20 dark:border-white/20 text-slate-900 dark:text-white text-xs font-semibold inline-flex items-center gap-2 hover:brightness-110 transition-all"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
                  </svg>
                  <span>TikTok</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
              {targetUser.instagramUrl && (
                <a
                  href={formatSocialLink(targetUser.instagramUrl, 'instagram')}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-500/15 via-pink-500/15 to-amber-500/15 border border-pink-500/30 text-pink-700 dark:text-pink-300 text-xs font-semibold inline-flex items-center gap-2 hover:brightness-110 transition-all"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <span>Instagram</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-2.5 flex-wrap pt-2">
            {isOwn ? (
              <>
                <button
                  onClick={() => {
                    setFullName(currentUser.fullName);
                    setUsername(currentUser.username);
                    setBio(currentUser.bio || '');
                    setFacebookUrl(currentUser.facebookUrl || '');
                    setTiktokUrl(currentUser.tiktokUrl || '');
                    setInstagramUrl(currentUser.instagramUrl || '');
                    setAvatarUrl(currentUser.avatarUrl || '');
                    setEditOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs inline-flex items-center gap-2 shadow-sm"
                >
                  <Edit3 className="w-4 h-4" />
                  {t('editProfile')}
                </button>
                <button
                  onClick={() => {
                    setProfilePrivacy(currentUser.privacy);
                    setShowOnlineStatus(privateInfo?.showOnlineStatus ?? true);
                    setNotificationsEnabled(privateInfo?.notificationsEnabled ?? true);
                    setPrivacyOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-medium inline-flex items-center gap-2 transition-colors"
                >
                  <Settings className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                  {t('privacySettings')}
                </button>
                <button
                  onClick={toggleTheme}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
                  {theme === 'dark' ? t('lightMode') : t('darkMode')}
                </button>
                <button
                  onClick={toggleLang}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Languages className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                  {t('languageLabel')}
                </button>
                <button
                  onClick={() => setPermissionsOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-800 dark:text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Smartphone className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                  {t('appPermissions')}
                </button>
                {!isInstalled && (isInstallable || isIOS) && (
                  <button
                    onClick={async () => {
                      if (isInstallable) {
                        const ok = await install();
                        if (ok) setPermissionsOpen(true);
                      } else if (isIOS) {
                        setIosGuideOpen(true);
                      }
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-[#00A86B]/12 dark:bg-[#00D68F]/12 text-[#008F5B] dark:text-[#00D68F] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    {t('installAppBtn')}
                  </button>
                )}
                {isServerAdmin && onOpenAdmin && (
                  <button
                    onClick={onOpenAdmin}
                    className="px-3.5 py-2.5 rounded-xl bg-[#00A86B]/12 dark:bg-[#00D68F]/12 text-[#008F5B] dark:text-[#00D68F] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {t('adminConsole')}
                  </button>
                )}
                {onSignOut && (
                  <button
                    onClick={onSignOut}
                    className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('signOut')}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => void toggleFollowUser(currentUser, targetUser, isFollowing)}
                  className={`px-4 py-2.5 rounded-xl font-semibold text-xs inline-flex items-center gap-2 transition-colors ${
                    isFollowing
                      ? 'bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-300'
                      : 'bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B]'
                  }`}
                >
                  {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                  {isFollowing ? t('followingState') : t('follow')}
                </button>
                <button
                  onClick={() => onMessageUser(targetUser)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-900 dark:text-white font-semibold text-xs inline-flex items-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                  {t('messageBtn')}
                </button>
                {!isActualOwn && (
                  <>
                    <button
                      onClick={() => void handleToggleBlock()}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-rose-500/15 text-slate-500 dark:text-[#A5B5AC] hover:text-rose-600 dark:hover:text-rose-300 transition-colors"
                      title={isBlocked ? 'Unblock Player' : 'Block Player'}
                    >
                      <Ban className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setReportOpen(true)}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-amber-500/15 text-slate-500 dark:text-[#A5B5AC] hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                      title="Report Player"
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </>
                )}
              </>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full pt-4 border-t border-slate-200 dark:border-[#00D68F]/15">
            <div className="p-3.5 rounded-2xl inset-surface text-center">
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {targetUser.followersCount || 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('followersLabel')}</p>
            </div>
            <div className="p-3.5 rounded-2xl inset-surface text-center">
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {targetUser.followingCount || 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('followingLabel')}</p>
            </div>
            <div className="p-3.5 rounded-2xl inset-surface text-center">
              <p className="text-xl font-display font-bold text-slate-900 dark:text-white tabular-nums">
                {targetUser.postsCount || 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('totalPostsLabel')}</p>
            </div>
            <div className="p-3.5 rounded-2xl inset-surface text-center">
              <p className="text-xl font-display font-bold text-[#00A86B] dark:text-[#00D68F] tabular-nums">
                {targetUser.tournamentsWon || 0}
              </p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">{t('titlesWonLabel')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* User Posts */}
      <section className="space-y-4">
        <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">{t('postsHeading')}</h2>
        {!isOwn && !publicPreview && targetUser.privacy === 'friends' && !isFollowing ? (
          <EmptyState
            icon={<Lock className="w-6 h-6" />}
            title="Friends-Only Profile"
            description={`Follow ${targetUser.fullName} to view their Carrom posts and match highlights.`}
          />
        ) : userPosts.length === 0 ? (
          <EmptyState
            icon={<Camera className="w-6 h-6" />}
            title="No posts yet"
            description="Posts shared by this player will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {userPosts.map((post) => (
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

      {/* Edit Profile Modal */}
      <ModalDialog open={editOpen} onClose={() => setEditOpen(false)} title={t('editProfile')}>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-4 py-1">
            <label className="relative cursor-pointer group shrink-0">
              <div className="h-16 w-16 rounded-full inset-surface border border-[#00A86B]/35 dark:border-[#00D68F]/35 flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="w-6 h-6 text-[#00A86B] dark:text-[#00D68F]" />
                )}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleAvatarPick(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">Profile Photo</p>
              <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">Tap circle to change avatar</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-slate-600 dark:text-[#A5B5AC]">{t('fullNameLabel')}</label>
              <input
                type="text"
                required
                maxLength={80}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-slate-600 dark:text-[#A5B5AC]">{t('usernameLabel')}</label>
              <input
                type="text"
                required
                maxLength={32}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-600 dark:text-[#A5B5AC]">Bio</label>
            <textarea
              rows={2}
              maxLength={300}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell other strikers about your gameplay style..."
              className="w-full p-3.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
            />
          </div>

          {/* Social Profiles: Facebook, TikTok, Instagram */}
          <div className="space-y-3 pt-1 border-t border-slate-200 dark:border-[#00D68F]/15">
            <p className="text-xs font-semibold text-slate-800 dark:text-white">{t('socialProfiles')}</p>
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('facebookLabel')}</label>
                <input
                  type="text"
                  maxLength={200}
                  value={facebookUrl}
                  onChange={(e) => setFacebookUrl(e.target.value)}
                  placeholder="https://facebook.com/yourname or username"
                  className="w-full px-3.5 py-2 rounded-xl inset-surface text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('tiktokLabel')}</label>
                <input
                  type="text"
                  maxLength={200}
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://tiktok.com/@username or @username"
                  className="w-full px-3.5 py-2 rounded-xl inset-surface text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('instagramLabel')}</label>
                <input
                  type="text"
                  maxLength={200}
                  value={instagramUrl}
                  onChange={(e) => setInstagramUrl(e.target.value)}
                  placeholder="https://instagram.com/username or username"
                  className="w-full px-3.5 py-2 rounded-xl inset-surface text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm"
          >
            {saving ? 'Saving...' : t('saveChanges')}
          </button>
        </form>
      </ModalDialog>

      {/* Privacy Settings Modal */}
      <ModalDialog open={privacyOpen} onClose={() => setPrivacyOpen(false)} title={t('privacySettings')}>
        <form onSubmit={handleSavePrivacy} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">
              Profile &amp; Posts Visibility
            </label>
            <select
              value={profilePrivacy}
              onChange={(e) => setProfilePrivacy(e.target.value as 'public' | 'friends')}
              className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            >
              <option value="public">Public (Anyone on Carrom Hub)</option>
              <option value="friends">Followers Only</option>
            </select>
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl inset-surface cursor-pointer">
            <span className="text-sm text-slate-900 dark:text-white">Show Online Status</span>
            <input
              type="checkbox"
              checked={showOnlineStatus}
              onChange={(e) => setShowOnlineStatus(e.target.checked)}
              className="accent-[#00D68F]"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl inset-surface cursor-pointer">
            <span className="text-sm text-slate-900 dark:text-white">Live Notification Popups</span>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              className="accent-[#00D68F]"
            />
          </label>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm"
          >
            {t('saveChanges')}
          </button>
        </form>
      </ModalDialog>

      {/* Report Player Modal */}
      <ModalDialog open={reportOpen} onClose={() => setReportOpen(false)} title="Report Player" maxWidth="max-w-md">
        <form onSubmit={handleReportUser} className="space-y-4">
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
          >
            <option value="Abusive behavior">Abusive behavior</option>
            <option value="Impersonation">Impersonation</option>
            <option value="Tournament cheating">Tournament cheating</option>
            <option value="Spam account">Spam account</option>
          </select>
          <button type="submit" className="w-full py-2.5 rounded-xl bg-amber-500 text-[#080D0B] font-semibold text-sm">
            {t('submitReport')}
          </button>
        </form>
      </ModalDialog>

      {/* App Permissions Modal */}
      <PermissionsModal
        open={permissionsOpen}
        onClose={() => setPermissionsOpen(false)}
        status={permStatus}
        onRequestMic={requestMicrophone}
        onRequestCamera={requestCamera}
        onRequestNotifications={requestNotifications}
        onDone={markPermsReviewed}
        onToast={onToast}
      />

      {/* iOS Home Screen Install Instructions */}
      <ModalDialog
        open={iosGuideOpen}
        onClose={() => setIosGuideOpen(false)}
        title={t('iosInstallTitle')}
        maxWidth="max-w-sm"
      >
        <div className="space-y-4 py-1">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">
            {t('iosInstallSteps')}
          </p>
          <button
            type="button"
            onClick={() => setIosGuideOpen(false)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs"
          >
            OK
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
