import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Bell,
  Compass,
  Home,
  Languages,
  LogOut,
  MessageSquare,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AuthScreen } from './components/auth/AuthScreen';
import { ChatView } from './components/chat/ChatView';
import { ExploreView } from './components/explore/ExploreView';
import { FeedView } from './components/feed/FeedView';
import { NotificationsView } from './components/notifications/NotificationsView';
import { ProfileView } from './components/profile/ProfileView';
import { BrandLogo } from './components/ui/BrandLogo';
import { ModalDialog, PlayerAvatar, ToastViewport } from './components/ui/ToastAndDialogs';
import { auth } from './lib/firebase';
import { usePreferences } from './lib/i18n';
import { formatRelativeTime } from './lib/media';
import { realtimeSocket } from './lib/websocket';
import {
  ensureUserProfileExists,
  getOrCreatePrivateConversation,
  markNotificationRead,
  subscribeToConversations,
  subscribeToFollowingIds,
  subscribeToNotifications,
  subscribeToPlatformSettings,
  subscribeToPosts,
  subscribeToPrivateInfo,
  subscribeToUsers,
} from './services/firestoreService';
import type {
  AppNotification,
  Conversation,
  NavTab,
  PlatformSettings,
  Post,
  ToastItem,
  UserPrivateInfo,
  UserPublicProfile,
} from './types';

export default function App() {
  const { theme, toggleTheme, toggleLang, t } = usePreferences();

  const [authPhase, setAuthPhase] = useState<'loading' | 'signed_out' | 'pending_verification' | 'ready'>('loading');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<UserPublicProfile | null>(null);
  const [privateInfo, setPrivateInfo] = useState<UserPrivateInfo | null>(null);
  const [isServerAdmin, setIsServerAdmin] = useState(false);

  // Navigation & UI state
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [viewedProfileUid, setViewedProfileUid] = useState<string | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [exploreQuery, setExploreQuery] = useState('');
  const [notifPopupOpen, setNotifPopupOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Live Firestore collections
  const [users, setUsers] = useState<UserPublicProfile[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);

  // Live WebSocket presence & typing
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingByConversation, setTypingByConversation] = useState<
    Record<string, { uid: string; name: string }[]>
  >({});

  const pushToast = useCallback(
    (kind: 'success' | 'error' | 'info', title: string, description?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, kind, title, description }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    []
  );

  const hydrateSignedInUser = useCallback(async (user: User) => {
    if (!user.emailVerified) {
      setFirebaseUser(user);
      setAuthPhase('pending_verification');
      return;
    }

    let pendingMeta: {
      fullName?: string;
      username?: string;
      phoneNumber?: string;
      avatarUrl?: string;
    } = {};
    const rawPending = localStorage.getItem(`carrom_pending_profile_${user.uid}`);
    if (rawPending) {
      try {
        pendingMeta = JSON.parse(rawPending);
      } catch {
        pendingMeta = {};
      }
    }

    const profile = await ensureUserProfileExists({
      uid: user.uid,
      email: user.email || '',
      fullName: pendingMeta.fullName || user.displayName || 'Carrom Player',
      username: pendingMeta.username,
      phoneNumber: pendingMeta.phoneNumber,
      avatarUrl: pendingMeta.avatarUrl || user.photoURL || undefined,
    });
    if (rawPending) {
      localStorage.removeItem(`carrom_pending_profile_${user.uid}`);
    }

    setFirebaseUser(user);
    setCurrentUser(profile);
    setAuthPhase('ready');

    // Verify admin privileges strictly via server endpoint
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { isAdmin?: boolean };
        setIsServerAdmin(Boolean(data.isAdmin));
      } else {
        setIsServerAdmin(false);
      }
    } catch {
      setIsServerAdmin(false);
    }

    realtimeSocket.connect();
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        realtimeSocket.disconnect();
        setFirebaseUser(null);
        setCurrentUser(null);
        setPrivateInfo(null);
        setIsServerAdmin(false);
        setAuthPhase('signed_out');
        return;
      }
      void hydrateSignedInUser(user);
    });
    return () => unsub();
  }, [hydrateSignedInUser]);

  // Attach Firestore subscriptions ONLY when authenticated & verified
  useEffect(() => {
    if (authPhase !== 'ready' || !firebaseUser) return;
    const uid = firebaseUser.uid;

    const uUsers = subscribeToUsers((list) => {
      setUsers(list);
      const self = list.find((u) => u.uid === uid);
      if (self) setCurrentUser(self);
    });
    const uPrivate = subscribeToPrivateInfo(uid, setPrivateInfo);
    const uPosts = subscribeToPosts((list) => {
      setPosts(list);
      setLoadingPosts(false);
    });
    const uConvs = subscribeToConversations(uid, setConversations);
    const uNotifs = subscribeToNotifications(uid, setNotifications);
    const uFollowing = subscribeToFollowingIds(uid, setFollowingIds);
    const uSettings = subscribeToPlatformSettings(setPlatformSettings);

    return () => {
      uUsers();
      uPrivate();
      uPosts();
      uConvs();
      uNotifs();
      uFollowing();
      uSettings();
    };
  }, [authPhase, firebaseUser?.uid]);

  // WebSocket live event listeners
  useEffect(() => {
    if (authPhase !== 'ready') return;
    const unsub = realtimeSocket.subscribe((ev) => {
      if ((ev.type === 'auth:ok' || ev.type === 'presence:state') && ev.onlineUserIds) {
        setOnlineUserIds(new Set(ev.onlineUserIds));
      } else if (ev.type === 'typing:start' && ev.conversationId && ev.uid) {
        setTypingByConversation((prev) => {
          const list = prev[ev.conversationId!] || [];
          if (list.some((item) => item.uid === ev.uid)) return prev;
          return {
            ...prev,
            [ev.conversationId!]: [...list, { uid: ev.uid!, name: ev.senderName || 'Player' }],
          };
        });
      } else if (ev.type === 'typing:stop' && ev.conversationId && ev.uid) {
        setTypingByConversation((prev) => {
          const list = (prev[ev.conversationId!] || []).filter((item) => item.uid !== ev.uid);
          return { ...prev, [ev.conversationId!]: list };
        });
      } else if (ev.type === 'notification:live' && ev.notification) {
        if (privateInfo?.notificationsEnabled !== false) {
          pushToast(
            'info',
            String(ev.notification.title || 'New Notification'),
            String(ev.notification.body || '')
          );
        }
      }
    });
    return () => unsub();
  }, [authPhase, privateInfo?.notificationsEnabled, pushToast]);

  const handleSignOut = async () => {
    realtimeSocket.disconnect();
    await signOut(auth);
    setActiveTab('feed');
    setActiveConversationId(null);
    setViewedProfileUid(null);
  };

  const handleOpenProfile = (uid: string) => {
    setViewedProfileUid(uid);
    setActiveTab('profile');
    setProfileMenuOpen(false);
  };

  const handleMessageUser = async (target: UserPublicProfile) => {
    if (!currentUser) return;
    try {
      const conv = await getOrCreatePrivateConversation(currentUser, target);
      setActiveConversationId(conv.id);
      setActiveTab('chat');
    } catch {
      pushToast('error', 'Could not open chat');
    }
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setExploreQuery(globalSearch);
    setActiveTab('explore');
  };

  const handleNavigateNotification = (n: AppNotification) => {
    setNotifPopupOpen(false);
    if (n.linkTab === 'chat' && n.targetId) {
      setActiveConversationId(n.targetId);
      setActiveTab('chat');
    } else if (n.linkTab === 'profile' && n.targetId) {
      handleOpenProfile(n.targetId);
    } else {
      setActiveTab('feed');
    }
  };

  const handleSelectConversation = (convId: string | null) => {
    setActiveConversationId(convId);
    if (convId) {
      const matchingUnread = notifications.filter(
        (n) => n.type === 'message' && !n.read && n.targetId === convId
      );
      for (const n of matchingUnread) {
        void markNotificationRead(n.id);
      }
    }
  };

  // Loading Splash Screen
  if (authPhase === 'loading') {
    return (
      <div className="min-h-screen bg-[#F6F8F7] dark:bg-[#080D0B] flex flex-col items-center justify-center gap-4">
        <BrandLogo size="lg" animated />
        <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">Preparing Carrom Hub Arena...</p>
      </div>
    );
  }

  // Unauthenticated or Pending Verification Screen
  if (authPhase === 'signed_out' || authPhase === 'pending_verification' || !currentUser) {
    return (
      <>
        <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((item) => item.id !== id))} />
        <AuthScreen
          pendingVerificationEmail={
            authPhase === 'pending_verification' ? firebaseUser?.email || 'your email' : null
          }
          onRefreshVerification={async () => {
            if (!auth.currentUser) return;
            await auth.currentUser.reload();
            if (auth.currentUser.emailVerified) {
              await hydrateSignedInUser(auth.currentUser);
              setWelcomeName(auth.currentUser.displayName || 'Striker');
            } else {
              pushToast('info', 'Still pending', 'Please click the link in your email inbox first.');
            }
          }}
          onSignOut={handleSignOut}
          onWelcomeSuccess={(name) => {
            setWelcomeName(name);
            window.setTimeout(() => setWelcomeName(null), 4500);
          }}
        />
      </>
    );
  }

  // Banned or Suspended Gate
  if (currentUser.isBanned || currentUser.isSuspended) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] dark:bg-[#080D0B] flex items-center justify-center p-4">
        <div className="card-surface rounded-3xl p-8 max-w-md text-center space-y-4">
          <ShieldCheck className="w-10 h-10 text-rose-500 dark:text-rose-400 mx-auto" />
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            {currentUser.isBanned ? 'Account Banned' : 'Account Suspended'}
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A5B5AC]">
            Your Carrom Hub access has been restricted by platform moderators.
          </p>
          <button
            onClick={handleSignOut}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white text-sm font-medium"
          >
            {t('signOut')}
          </button>
        </div>
      </div>
    );
  }

  // Maintenance Mode Gate for non-admins
  if (platformSettings?.maintenanceMode && !isServerAdmin) {
    return (
      <div className="min-h-screen bg-[#F6F8F7] dark:bg-[#080D0B] flex items-center justify-center p-4">
        <div className="card-surface rounded-3xl p-8 max-w-md text-center space-y-4">
          <BrandLogo size="md" animated />
          <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white">
            Scheduled Arena Maintenance
          </h1>
          <p className="text-sm text-slate-600 dark:text-[#A5B5AC]">
            Carrom Hub is undergoing a brief upgrade. Please check back shortly.
          </p>
          <button
            onClick={handleSignOut}
            className="px-5 py-2.5 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white text-sm font-medium"
          >
            {t('signOut')}
          </button>
        </div>
      </div>
    );
  }

  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const unreadChatByConv = notifications.reduce<Record<string, number>>((acc, n) => {
    if (n.type === 'message' && !n.read && n.targetId) {
      acc[n.targetId] = (acc[n.targetId] || 0) + 1;
    }
    return acc;
  }, {});
  const totalUnreadChats = Object.values(unreadChatByConv).reduce((sum, count) => sum + count, 0);
  const blockedIds = privateInfo?.blockedUserIds || [];
  const viewedUser =
    users.find((u) => u.uid === (viewedProfileUid || currentUser.uid)) || currentUser;

  const desktopNavItems: { id: NavTab; label: string; icon: typeof Home }[] = [
    { id: 'feed', label: t('homeFeed'), icon: Home },
    { id: 'explore', label: t('explorePlayers'), icon: Compass },
    { id: 'chat', label: t('inboxTitle'), icon: MessageSquare },
    { id: 'notifications', label: t('notifications'), icon: Bell },
    { id: 'profile', label: t('myProfile'), icon: UserIcon },
  ];
  if (isServerAdmin) {
    desktopNavItems.push({ id: 'admin', label: t('adminConsole'), icon: ShieldCheck });
  }

  const isMobileFullChat = activeTab === 'chat';

  return (
    <div
      className={`bg-[#F6F8F7] dark:bg-[#080D0B] text-slate-900 dark:text-white flex flex-col transition-colors ${
        isMobileFullChat ? 'h-[100dvh] overflow-hidden md:h-auto md:min-h-screen md:overflow-visible' : 'min-h-screen'
      }`}
    >
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((item) => item.id !== id))} />

      {/* Top Sticky Header (hidden on mobile during full-screen Inbox) */}
      <header
        className={`sticky top-0 z-40 h-14 sm:h-16 border-b border-slate-200 dark:border-[#00D68F]/15 bg-white/90 dark:bg-[#080D0B]/90 backdrop-blur-xl ${
          isMobileFullChat ? 'hidden md:block' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-3 sm:gap-6">
          <button onClick={() => setActiveTab('feed')} className="shrink-0 text-left">
            <BrandLogo size="sm" />
          </button>

          {/* Desktop Global Search Bar */}
          <form onSubmit={handleSearchSubmit} className="hidden md:flex flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 rounded-xl inset-surface text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
            />
          </form>

          {/* Right Header Controls (Language + Theme + Messages + Notifications + Profile) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={toggleLang}
              className="h-9 px-2.5 rounded-xl bg-slate-100 dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/15 hover:border-[#00A86B]/50 dark:hover:border-[#00D68F]/40 flex items-center justify-center gap-1 text-xs font-semibold text-slate-700 dark:text-white transition-colors whitespace-nowrap"
              title="Switch Language (English / বাংলা)"
              aria-label="Switch language"
            >
              <Languages className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
              <span>{t('languageLabel')}</span>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/15 hover:border-[#00A86B]/50 dark:hover:border-[#00D68F]/40 flex items-center justify-center text-slate-700 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white transition-colors"
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
              aria-label={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-700" />
              )}
            </button>

            <div className="relative hidden md:block">
              <button
                onClick={() => {
                  setNotifPopupOpen((v) => !v);
                  setProfileMenuOpen(false);
                }}
                className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/15 hover:border-[#00A86B]/50 dark:hover:border-[#00D68F]/40 flex items-center justify-center text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white transition-colors relative"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadNotifications > 9 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>

              {/* Animated Notification Popup */}
              <AnimatePresence>
                {notifPopupOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-11 w-80 rounded-2xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/25 shadow-2xl overflow-hidden z-50"
                  >
                    <div className="px-4 py-3 border-b border-slate-200 dark:border-[#00D68F]/15 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {t('recentNotifications')}
                      </span>
                      <button
                        onClick={() => {
                          setNotifPopupOpen(false);
                          setActiveTab('notifications');
                        }}
                        className="text-[11px] text-[#00A86B] dark:text-[#00D68F] hover:underline"
                      >
                        {t('viewAll')}
                      </button>
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-[#00D68F]/10">
                      {notifications.length === 0 ? (
                        <p className="p-4 text-xs text-slate-500 dark:text-[#A5B5AC] text-center">
                          {t('noNotificationsYet')}
                        </p>
                      ) : (
                        notifications.slice(0, 5).map((n) => (
                          <button
                            key={n.id}
                            onClick={async () => {
                              if (!n.read) await markNotificationRead(n.id);
                              handleNavigateNotification(n);
                            }}
                            className={`w-full p-3 text-left flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-white/5 ${
                              !n.read ? 'bg-[#00A86B]/8 dark:bg-[#00D68F]/8' : ''
                            }`}
                          >
                            <PlayerAvatar src={n.actorAvatar} name={n.actorName} size="xs" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{n.title}</p>
                              <p className="text-[11px] text-slate-600 dark:text-[#A5B5AC] line-clamp-2">{n.body}</p>
                              <p className="text-[10px] text-slate-400 dark:text-[#64746B] mt-0.5">
                                {formatRelativeTime(n.createdAt)}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative hidden md:block">
              <button
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifPopupOpen(false);
                }}
                className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                aria-label="Account menu"
              >
                <PlayerAvatar
                  src={currentUser.avatarUrl}
                  name={currentUser.fullName}
                  size="sm"
                  online={onlineUserIds.has(currentUser.uid)}
                />
              </button>

              <AnimatePresence>
                {profileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 top-11 w-56 rounded-2xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/25 shadow-2xl py-2 z-50"
                  >
                    <div className="px-4 py-2 border-b border-slate-200 dark:border-[#00D68F]/15">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {currentUser.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">
                        @{currentUser.username}
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenProfile(currentUser.uid)}
                      className="w-full px-4 py-2 text-left text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      <UserIcon className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                      {t('myProfile')}
                    </button>
                    <button
                      onClick={toggleTheme}
                      className="w-full px-4 py-2 text-left text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      {theme === 'dark' ? (
                        <Sun className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-slate-600" />
                      )}
                      {theme === 'dark' ? t('lightMode') : t('darkMode')}
                    </button>
                    <button
                      onClick={toggleLang}
                      className="w-full px-4 py-2 text-left text-xs text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      <Languages className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                      {t('languageLabel')}
                    </button>
                    {isServerAdmin && (
                      <button
                        onClick={() => {
                          setProfileMenuOpen(false);
                          setActiveTab('admin');
                        }}
                        className="w-full px-4 py-2 text-left text-xs text-[#00A86B] dark:text-[#00D68F] hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {t('adminConsole')}
                      </button>
                    )}
                    <button
                      onClick={handleSignOut}
                      className="w-full px-4 py-2 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {t('signOut')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Global Announcement Banner (if configured by Admin) */}
      {platformSettings?.announcementBanner && (
        <div
          className={`bg-[#00A86B]/12 dark:bg-[#00D68F]/15 border-b border-[#00A86B]/20 dark:border-[#00D68F]/25 px-4 py-2 text-center text-xs text-slate-900 dark:text-white ${
            isMobileFullChat ? 'hidden md:block' : ''
          }`}
        >
          {platformSettings.announcementBanner}
        </div>
      )}

      {/* Main Content Shell */}
      <div
        className={`flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 md:grid-cols-12 md:gap-5 ${
          isMobileFullChat
            ? 'min-h-0 px-0 py-0 pb-0 md:px-6 md:py-4 md:pb-8 items-stretch md:items-start'
            : 'px-3 sm:px-6 py-4 pb-20 md:pb-8 gap-5 items-start'
        }`}
      >
        {/* Desktop Left Navigation Sidebar */}
        <aside className="hidden md:flex md:col-span-3 lg:col-span-2 flex-col gap-1 sticky top-20">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id &&
              (item.id !== 'profile' || viewedProfileUid === currentUser.uid || !viewedProfileUid);
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'profile') setViewedProfileUid(currentUser.uid);
                  setActiveTab(item.id);
                }}
                className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-[#00A86B]/15 to-[#00A86B]/5 dark:from-[#00D68F]/20 dark:to-[#00B87A]/5 text-[#008F5B] dark:text-[#00D68F] border border-[#00A86B]/25 dark:border-[#00D68F]/30 font-semibold'
                    : 'text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="text-[10px] font-mono-tabular text-[#00A86B] dark:text-[#00D68F]">
                    {unreadNotifications}
                  </span>
                )}
                {item.id === 'chat' && totalUnreadChats > 0 && (
                  <span className="text-[10px] font-mono-tabular text-[#00A86B] dark:text-[#00D68F]">
                    {totalUnreadChats}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Active Page Stage */}
        <main
          className={`md:col-span-9 lg:col-span-10 min-w-0 ${
            isMobileFullChat ? 'h-full min-h-0 flex flex-col md:block' : ''
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab + (viewedProfileUid || '')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              className={isMobileFullChat ? 'flex-1 h-full min-h-0 flex flex-col md:block' : ''}
            >
              {activeTab === 'feed' && (
                <FeedView
                  currentUser={currentUser}
                  posts={posts}
                  users={users}
                  followingIds={followingIds}
                  blockedUserIds={blockedIds}
                  onlineUserIds={onlineUserIds}
                  loadingPosts={loadingPosts}
                  onOpenProfile={handleOpenProfile}
                  onNavigateTab={setActiveTab}
                  onToast={pushToast}
                />
              )}

              {activeTab === 'explore' && (
                <ExploreView
                  currentUser={currentUser}
                  users={users}
                  posts={posts}
                  followingIds={followingIds}
                  blockedUserIds={blockedIds}
                  onlineUserIds={onlineUserIds}
                  initialQuery={exploreQuery}
                  onOpenProfile={handleOpenProfile}
                  onToast={pushToast}
                />
              )}

              {activeTab === 'chat' && (
                <ChatView
                  currentUser={currentUser}
                  users={users}
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  blockedUserIds={blockedIds}
                  onlineUserIds={onlineUserIds}
                  unreadByConversation={unreadChatByConv}
                  typingByConversation={typingByConversation}
                  onSelectConversation={handleSelectConversation}
                  onBackToFeed={() => setActiveTab('feed')}
                  onOpenProfile={handleOpenProfile}
                  onToast={pushToast}
                />
              )}

              {activeTab === 'notifications' && (
                <NotificationsView
                  notifications={notifications}
                  onNavigateNotification={handleNavigateNotification}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileView
                  currentUser={currentUser}
                  targetUser={viewedUser}
                  privateInfo={privateInfo}
                  posts={posts}
                  followingIds={followingIds}
                  onlineUserIds={onlineUserIds}
                  isServerAdmin={isServerAdmin}
                  onOpenAdmin={() => setActiveTab('admin')}
                  onSignOut={() => void handleSignOut()}
                  onMessageUser={handleMessageUser}
                  onOpenProfile={handleOpenProfile}
                  onToast={pushToast}
                />
              )}

              {activeTab === 'admin' && (
                <AdminDashboard
                  currentUser={currentUser}
                  posts={posts}
                  platformSettings={platformSettings}
                  onlineUserIds={onlineUserIds}
                  onToast={pushToast}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (hidden during full-screen Inbox) */}
      {!isMobileFullChat && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 dark:bg-[#080D0B]/95 backdrop-blur-xl border-t border-slate-200 dark:border-[#00D68F]/20 grid grid-cols-5 items-center"
        >
          {(
            [
              { id: 'feed', label: t('feedMobile'), icon: Home, badge: 0 },
              { id: 'explore', label: t('exploreMobile'), icon: Compass, badge: 0 },
              { id: 'chat', label: t('chatMobile'), icon: MessageSquare, badge: totalUnreadChats },
              { id: 'notifications', label: t('alertsMobile'), icon: Bell, badge: unreadNotifications },
              { id: 'profile', label: t('profileMobile'), icon: UserIcon, badge: 0 },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active =
              activeTab === item.id &&
              (item.id !== 'profile' || viewedProfileUid === currentUser.uid || !viewedProfileUid);
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'profile') setViewedProfileUid(currentUser.uid);
                  setActiveTab(item.id);
                }}
                className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors relative ${
                  active
                    ? 'text-[#00A86B] dark:text-[#00D68F]'
                    : 'text-slate-500 dark:text-[#A5B5AC]'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 h-4 min-w-[16px] px-1 rounded-full bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Welcome Popup on Login */}
      <ModalDialog
        open={Boolean(welcomeName)}
        onClose={() => setWelcomeName(null)}
        title={t('welcomeTitle', { name: welcomeName || 'Striker' })}
        maxWidth="max-w-sm"
      >
        <div className="text-center space-y-4 py-2">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-[#00A86B]/15 dark:bg-[#00D68F]/15 border border-[#00A86B]/30 dark:border-[#00D68F]/30 flex items-center justify-center text-[#00A86B] dark:text-[#00D68F]">
            <Sparkles className="w-6 h-6" />
          </div>
          <p className="text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">{t('welcomeBody')}</p>
          <button
            onClick={() => setWelcomeName(null)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm"
          >
            {t('enterArena')}
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
