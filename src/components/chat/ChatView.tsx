import {
  ArrowLeft,
  Ban,
  Camera,
  Check,
  CheckCheck,
  ExternalLink,
  Film,
  Globe,
  Link2,
  Loader2,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Reply,
  Search,
  Send,
  Shield,
  ShieldCheck,
  Smile,
  Sparkles,
  Square,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl, formatRelativeTime, uploadMediaBlob } from '../../lib/media';
import { getBestAudioMimeType, useAppPermissions } from '../../lib/permissions';
import { realtimeSocket } from '../../lib/websocket';
import {
  createGroupConversation,
  deleteOwnMessage,
  getOrCreatePrivateConversation,
  markMessagesRead,
  reactToMessage,
  sendChatMessage,
  subscribeToMessages,
  updateGroupChatParticipants,
  updateUserPrivateSettings,
} from '../../services/firestoreService';
import type { ChatMessage, Conversation, UserPublicProfile } from '../../types';
import { CameraCaptureModal, PermissionsModal } from '../ui/PermissionsModal';
import { ModalDialog, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';

const EMOJI_PALETTE = ['👍', '❤️', '🔥', '👏', '😂', '😮', '🎯', '🏆', '🔴', '⚡'];
const QUICK_STARTERS = ['Hey! Ready for a Carrom match? 🎯', '1v1 Carrom Pool now?', 'GG! Nice shot! 👏'];
const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function normalizeSafeUrl(raw: string): { href: string; cleanToken: string; trailing: string } | null {
  let cleanToken = raw;
  let trailing = '';
  while (cleanToken.length > 0 && /[.,!?;:)\]]$/.test(cleanToken)) {
    trailing = cleanToken.slice(-1) + trailing;
    cleanToken = cleanToken.slice(0, -1);
  }
  if (!cleanToken) return null;
  const candidate = cleanToken.toLowerCase().startsWith('www.') ? `https://${cleanToken}` : cleanToken;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return { href: parsed.toString(), cleanToken, trailing };
  } catch {
    return null;
  }
}

function extractUrls(text: string): { href: string; hostname: string }[] {
  if (!text) return [];
  const matches = text.match(URL_SPLIT_REGEX) || [];
  const seen = new Set<string>();
  const out: { href: string; hostname: string }[] = [];
  for (const m of matches) {
    const norm = normalizeSafeUrl(m);
    if (!norm || seen.has(norm.href)) continue;
    seen.add(norm.href);
    try {
      out.push({ href: norm.href, hostname: new URL(norm.href).hostname.replace(/^www\./, '') });
    } catch {
      // ignore invalid
    }
  }
  return out;
}

function renderMessageTextWithLinks(text: string) {
  const parts = text.split(URL_SPLIT_REGEX);
  return parts.map((part, idx) => {
    if (!part) return null;
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const norm = normalizeSafeUrl(part);
      if (norm) {
        return (
          <Fragment key={idx}>
            <a
              href={norm.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-white/85 underline-offset-2 font-semibold text-white hover:text-[#B9F6CA] [overflow-wrap:anywhere]"
            >
              {norm.cleanToken}
            </a>
            {norm.trailing}
          </Fragment>
        );
      }
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function getTimeMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

interface ChatViewProps {
  currentUser: UserPublicProfile;
  users: UserPublicProfile[];
  conversations: Conversation[];
  activeConversationId: string | null;
  blockedUserIds: string[];
  onlineUserIds: Set<string>;
  unreadByConversation?: Record<string, number>;
  typingByConversation: Record<string, { uid: string; name: string }[]>;
  onSelectConversation: (id: string | null) => void;
  onBackToFeed?: () => void;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function ChatView({
  currentUser,
  users,
  conversations,
  activeConversationId,
  blockedUserIds,
  onlineUserIds,
  unreadByConversation = {},
  typingByConversation,
  onSelectConversation,
  onBackToFeed,
  onOpenProfile,
  onToast,
}: ChatViewProps) {
  const { t } = usePreferences();
  const {
    status: permStatus,
    reviewed: permsReviewed,
    markReviewed: markPermsReviewed,
    requestMicrophone,
    requestCamera,
    requestNotifications,
  } = useAppPermissions();

  const [searchTerm, setSearchTerm] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'direct' | 'group'>('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [sending, setSending] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const cancelVoiceRef = useRef(false);

  // Permissions & Camera modals
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  // Modals
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [groupManageOpen, setGroupManageOpen] = useState(false);

  const [reactingMsgId, setReactingMsgId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId) || null;

  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }
    const unsub = subscribeToMessages(activeConv.id, currentUser.uid, (list) => {
      setMessages(list);
      void markMessagesRead(activeConv.id, list, currentUser.uid);
    });
    return () => unsub();
  }, [activeConv?.id, currentUser.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConv?.id]);

  useEffect(() => {
    if (!recording) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  // Auto-resize textarea for long messages
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [messageInput]);

  const getConversationDisplay = (conv: Conversation) => {
    if (conv.type === 'group') {
      return {
        title: conv.name || 'Carrom Squad',
        subtitle: `${conv.participantIds.length} ${t('members')}`,
        avatar: conv.avatarUrl,
        otherUid: null as string | null,
        verified: false,
        online: conv.participantIds.some((id) => id !== currentUser.uid && onlineUserIds.has(id)),
      };
    }
    const otherUid = conv.participantIds.find((id) => id !== currentUser.uid) || currentUser.uid;
    const liveUser = users.find((u) => u.uid === otherUid);
    const stub = conv.participantProfiles?.[otherUid];
    const uname = liveUser?.username || stub?.username;
    return {
      title: liveUser?.fullName || stub?.fullName || 'Carrom Player',
      subtitle: uname ? `@${uname}` : undefined,
      avatar: liveUser?.avatarUrl || stub?.avatarUrl,
      otherUid,
      verified: Boolean(liveUser?.isVerified),
      online: onlineUserIds.has(otherUid),
    };
  };

  const handleTypingChange = (val: string) => {
    setMessageInput(val);
    if (!activeConv) return;
    realtimeSocket.sendTyping(activeConv.id, activeConv.participantIds, currentUser.fullName, true);
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      realtimeSocket.sendTyping(activeConv.id, activeConv.participantIds, currentUser.fullName, false);
    }, 1800);
  };

  const sendTextInternal = async () => {
    if (!activeConv || !messageInput.trim() || sending) return;
    const display = getConversationDisplay(activeConv);
    if (display.otherUid && blockedUserIds.includes(display.otherUid)) {
      onToast('error', 'User blocked', 'Unblock this user in Privacy Settings to send messages.');
      return;
    }
    setSending(true);
    try {
      realtimeSocket.sendTyping(activeConv.id, activeConv.participantIds, currentUser.fullName, false);
      await sendChatMessage({
        conversation: activeConv,
        sender: currentUser,
        text: messageInput,
        mediaType: 'text',
        replyTo,
      });
      setMessageInput('');
      setReplyTo(null);
      setEmojiOpen(false);
    } catch {
      onToast('error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleSendText = async (e: FormEvent) => {
    e.preventDefault();
    await sendTextInternal();
  };

  const handleComposerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendTextInternal();
    }
  };

  const handleSendMedia = async (file: File | undefined, kind: 'image' | 'video') => {
    if (!file || !activeConv) return;
    setAttachOpen(false);
    setUploadingMedia(true);
    try {
      const url =
        kind === 'image'
          ? await compressImageToDataUrl(file, 1080, 0.8)
          : await uploadMediaBlob(file);
      await sendChatMessage({
        conversation: activeConv,
        sender: currentUser,
        text: kind === 'image' ? 'Sent a photo' : 'Sent a video',
        mediaUrl: url,
        mediaType: kind,
        replyTo,
      });
      setReplyTo(null);
    } catch (err) {
      onToast('error', 'Media upload failed', err instanceof Error ? err.message : undefined);
    } finally {
      setUploadingMedia(false);
    }
  };

  const startVoiceRecord = async () => {
    if (!activeConv || recording) return;
    if (permStatus.microphone === 'denied') {
      setPermissionsOpen(true);
      onToast('error', t('micPermTitle'), t('blockedLabel'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = getBestAudioMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      cancelVoiceRef.current = false;
      audioChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        if (cancelVoiceRef.current) {
          audioChunksRef.current = [];
          return;
        }
        const resolvedType = (recorder.mimeType || preferredMime || 'audio/webm').split(';')[0];
        const blob = new Blob(audioChunksRef.current, { type: resolvedType });
        if (blob.size < 300) return;
        setUploadingMedia(true);
        try {
          const url = await uploadMediaBlob(blob);
          await sendChatMessage({
            conversation: activeConv,
            sender: currentUser,
            text: 'Voice message',
            mediaUrl: url,
            mediaType: 'voice',
            replyTo,
          });
          setReplyTo(null);
        } catch (err) {
          onToast('error', 'Voice message upload failed', err instanceof Error ? err.message : undefined);
        } finally {
          setUploadingMedia(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch {
      setPermissionsOpen(true);
      onToast('error', t('micPermTitle'), 'Allow microphone access to record voice messages.');
    }
  };

  const stopVoiceRecord = (cancel: boolean) => {
    cancelVoiceRef.current = cancel;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleStartPrivateChat = async (target: UserPublicProfile) => {
    try {
      const conv = await getOrCreatePrivateConversation(currentUser, target);
      setNewChatOpen(false);
      onSelectConversation(conv.id);
    } catch {
      onToast('error', 'Could not start chat');
    }
  };

  const handleCreateGroupChat = async (e: FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedMemberIds.length === 0) return;
    const members = users.filter((u) => selectedMemberIds.includes(u.uid));
    try {
      const conv = await createGroupConversation({
        admin: currentUser,
        name: groupName,
        members,
      });
      setNewGroupOpen(false);
      setGroupName('');
      setSelectedMemberIds([]);
      onSelectConversation(conv.id);
      onToast('success', 'Group chat created');
    } catch {
      onToast('error', 'Could not create group chat');
    }
  };

  const handleBlockOtherUser = async (otherUid: string) => {
    const isBlocked = blockedUserIds.includes(otherUid);
    const next = isBlocked
      ? blockedUserIds.filter((id) => id !== otherUid)
      : [...blockedUserIds, otherUid];
    try {
      await updateUserPrivateSettings(currentUser.uid, { blockedUserIds: next });
      onToast('info', isBlocked ? 'User unblocked' : 'User blocked');
    } catch {
      onToast('error', 'Could not update block list');
    }
  };

  const handleGroupMemberUpdate = async (targetUid: string, add: boolean) => {
    if (!activeConv || activeConv.type !== 'group') return;
    const nextIds = add
      ? Array.from(new Set([...activeConv.participantIds, targetUid])).slice(0, 50)
      : activeConv.participantIds.filter((id) => id !== targetUid);

    const nextProfiles = { ...(activeConv.participantProfiles || {}) };
    if (add) {
      const u = users.find((x) => x.uid === targetUid);
      if (u) {
        nextProfiles[targetUid] = {
          fullName: u.fullName,
          username: u.username,
          ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
        };
      }
    } else {
      delete nextProfiles[targetUid];
    }

    try {
      await updateGroupChatParticipants(activeConv, nextIds, nextProfiles);
      onToast('success', add ? 'Member added' : 'Member removed');
    } catch {
      onToast('error', 'Could not update members');
    }
  };

  const otherUsers = users.filter((u) => u.uid !== currentUser.uid && !blockedUserIds.includes(u.uid));
  const sortedActivePlayers = [...otherUsers].sort((a, b) => {
    const aOn = onlineUserIds.has(a.uid) ? 1 : 0;
    const bOn = onlineUserIds.has(b.uid) ? 1 : 0;
    return bOn - aOn || (b.followersCount || 0) - (a.followersCount || 0);
  });
  const onlinePlayersCount = otherUsers.filter((u) => onlineUserIds.has(u.uid)).length;
  const totalUnreadCount = Object.values(unreadByConversation).reduce((acc, n) => acc + n, 0);

  const sortedConversations = [...conversations].sort((a, b) => {
    const unreadDiff = (unreadByConversation[b.id] || 0) - (unreadByConversation[a.id] || 0);
    if (unreadDiff !== 0) return unreadDiff;
    const bTime = Math.max(getTimeMs(b.lastMessageAt), getTimeMs(b.updatedAt));
    const aTime = Math.max(getTimeMs(a.lastMessageAt), getTimeMs(a.updatedAt));
    return bTime - aTime;
  });

  const filteredConversations = sortedConversations.filter((c) => {
    const info = getConversationDisplay(c);
    const matchesSearch =
      info.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (info.subtitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.lastMessageText || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (inboxFilter === 'unread') return (unreadByConversation[c.id] || 0) > 0;
    if (inboxFilter === 'direct') return c.type === 'private';
    if (inboxFilter === 'group') return c.type === 'group';
    return true;
  });

  const filteredModalUsers = otherUsers.filter((u) => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return true;
    return u.fullName.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  });

  const activeDisplay = activeConv ? getConversationDisplay(activeConv) : null;
  const activeTypers = activeConv ? typingByConversation[activeConv.id] || [] : [];

  const handleQuickStarterSend = async (starterText: string) => {
    if (!activeConv || sending) return;
    setSending(true);
    try {
      await sendChatMessage({
        conversation: activeConv,
        sender: currentUser,
        text: starterText,
        mediaType: 'text',
      });
    } catch {
      onToast('error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const needsPermissionsPrompt =
    !permsReviewed && (permStatus.microphone !== 'granted' || permStatus.camera !== 'granted');

  const renderPreviewSnippet = (text?: string) => {
    const val = text || 'No messages yet';
    if (val === 'Voice message') {
      return (
        <span className="inline-flex items-center gap-1 truncate">
          <Mic className="w-3 h-3 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
          <span className="truncate">{val}</span>
        </span>
      );
    }
    if (val === 'Sent a photo' || val === 'Photo') {
      return (
        <span className="inline-flex items-center gap-1 truncate">
          <Camera className="w-3 h-3 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
          <span className="truncate">{val}</span>
        </span>
      );
    }
    if (val === 'Sent a video' || val === 'Video clip') {
      return (
        <span className="inline-flex items-center gap-1 truncate">
          <Film className="w-3 h-3 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
          <span className="truncate">{val}</span>
        </span>
      );
    }
    if (URL_SPLIT_REGEX.test(val)) {
      URL_SPLIT_REGEX.lastIndex = 0;
      return (
        <span className="inline-flex items-center gap-1 truncate">
          <Link2 className="w-3 h-3 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
          <span className="truncate">{val}</span>
        </span>
      );
    }
    return <span className="truncate">{val}</span>;
  };

  return (
    <div className="w-full h-full md:h-[calc(100vh-8rem)] md:min-h-[560px] bg-white dark:bg-[#101A15] md:card-surface rounded-none md:rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Left Conversation List (Inbox Home) */}
      <aside
        className={`md:col-span-5 lg:col-span-4 md:border-r border-slate-200 dark:border-[#00D68F]/15 flex flex-col bg-slate-50/60 dark:bg-[#0D1612] min-h-0 h-full ${
          activeConv ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Sleek Inbox Home Header */}
        <div className="px-3.5 pt-3 pb-3 md:p-4 border-b border-slate-200 dark:border-[#00D68F]/15 space-y-3 bg-white dark:bg-[#101A15]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {onBackToFeed && (
                <button
                  onClick={onBackToFeed}
                  className="md:hidden min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-transform"
                  aria-label={t('backToFeed')}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-display font-bold text-slate-900 dark:text-white truncate">
                    {t('inboxTitle')}
                  </h2>
                  {totalUnreadCount > 0 && (
                    <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                      {totalUnreadCount}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">
                  <span className="text-[#00A86B] dark:text-[#00D68F] font-semibold tabular-nums">
                    {onlinePlayersCount}
                  </span>{' '}
                  {t('onlinePlayersStat').toLowerCase()} · {conversations.length} {t('allChats').toLowerCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setPermissionsOpen(true)}
                title={t('appPermissions')}
                aria-label={t('appPermissions')}
                className="min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-[#D5E2DB] flex items-center justify-center transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
              </button>
              <button
                onClick={() => {
                  setPlayerSearch('');
                  setNewChatOpen(true);
                }}
                title={t('newChatBtn')}
                className="min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] flex items-center justify-center shadow-sm hover:brightness-105 transition-all"
              >
                <MessageSquarePlus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setNewGroupOpen(true)}
                title={t('newGroupBtn')}
                className="min-h-[44px] min-w-[44px] md:min-h-[38px] md:min-w-[38px] rounded-xl bg-[#00A86B]/12 hover:bg-[#00A86B]/20 dark:bg-[#00D68F]/10 dark:hover:bg-[#00D68F]/20 text-[#008F5B] dark:text-[#00D68F] flex items-center justify-center transition-colors"
              >
                <Users className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('searchChats')}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl inset-surface text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
            />
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#080D0B]/70 border border-slate-200/80 dark:border-[#00D68F]/15">
            {(
              [
                { id: 'all', label: t('allChats') },
                { id: 'unread', label: t('unreadChats'), count: totalUnreadCount },
                { id: 'direct', label: t('directChats') },
                { id: 'group', label: t('groupChats') },
              ] as const
            ).map((tabItem) => (
              <button
                key={tabItem.id}
                onClick={() => setInboxFilter(tabItem.id)}
                className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-colors flex items-center justify-center gap-1 whitespace-nowrap ${
                  inboxFilter === tabItem.id
                    ? 'bg-white dark:bg-[#14221B] text-[#008F5B] dark:text-[#00D68F] font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="truncate">{tabItem.label}</span>
                {'count' in tabItem && tabItem.count > 0 && (
                  <span className="text-[10px] font-bold tabular-nums">({tabItem.count})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Inbox Body: Permissions Card + Active Strikers + Message Senders List */}
        <div className="flex-1 overflow-y-auto">
          {/* App Permissions Setup Card (shown until reviewed or granted) */}
          {needsPermissionsPrompt && (
            <div className="m-3 p-3 rounded-2xl bg-[#00A86B]/10 dark:bg-[#00D68F]/10 border border-[#00A86B]/25 dark:border-[#00D68F]/25 flex items-center justify-between gap-2.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
                  <span className="truncate">{t('permissionsBannerTitle')}</span>
                </p>
                <p className="text-[11px] text-slate-600 dark:text-[#A5B5AC] leading-snug mt-0.5 line-clamp-2">
                  {t('permissionsBannerDesc')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsOpen(true)}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-[11px] font-bold whitespace-nowrap shrink-0"
              >
                {t('allowBtn')}
              </button>
            </div>
          )}

          {/* Active Strikers Horizontal Strip */}
          {sortedActivePlayers.length > 0 && (
            <div className="px-3.5 py-3 border-b border-slate-200 dark:border-[#00D68F]/10 bg-white/60 dark:bg-[#101A15]/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-600 dark:text-[#A5B5AC]">
                  {t('activePlayersNow')}
                </span>
                <button
                  onClick={() => {
                    setPlayerSearch('');
                    setNewChatOpen(true);
                  }}
                  className="text-[11px] font-medium text-[#00A86B] dark:text-[#00D68F] hover:underline"
                >
                  {t('viewAll')}
                </button>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto pb-0.5">
                {sortedActivePlayers.slice(0, 12).map((player) => {
                  const isOnline = onlineUserIds.has(player.uid);
                  return (
                    <button
                      key={player.uid}
                      onClick={() => void handleStartPrivateChat(player)}
                      className="shrink-0 w-14 flex flex-col items-center gap-1 group"
                    >
                      <div
                        className={`p-0.5 rounded-full ${
                          isOnline
                            ? 'ring-2 ring-[#00D68F] bg-white dark:bg-[#080D0B]'
                            : 'ring-1 ring-slate-200 dark:ring-white/10'
                        }`}
                      >
                        <PlayerAvatar
                          src={player.avatarUrl}
                          name={player.fullName}
                          size="sm"
                          online={isOnline}
                        />
                      </div>
                      <span className="text-[10px] font-medium text-slate-700 dark:text-[#D5E2DB] group-hover:text-[#00A86B] dark:group-hover:text-[#00D68F] truncate w-full text-center">
                        {player.fullName.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section Sub-Header for People Who Messaged */}
          <div className="px-3.5 py-2 border-b border-slate-200/70 dark:border-[#00D68F]/10 flex items-center justify-between bg-slate-100/70 dark:bg-[#080D0B]/40">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-[#A5B5AC]">
              {t('recentMessagers')}
            </span>
            <span className="text-[11px] font-mono-tabular text-slate-500 dark:text-[#A5B5AC]">
              {filteredConversations.length}
            </span>
          </div>

          {/* Conversation / Message Senders List */}
          {filteredConversations.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="mx-auto h-11 w-11 rounded-2xl bg-[#00A86B]/12 dark:bg-[#00D68F]/15 text-[#00A86B] dark:text-[#00D68F] flex items-center justify-center">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t('noMatchingChats')}</p>
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC] max-w-xs mx-auto">
                {t('noMatchingChatsDesc')}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => {
                    setPlayerSearch('');
                    setNewChatOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-semibold"
                >
                  {t('newChatBtn')}
                </button>
                <button
                  onClick={() => setNewGroupOpen(true)}
                  className="px-4 py-2 rounded-xl inset-surface text-slate-700 dark:text-white text-xs font-medium"
                >
                  {t('newGroupBtn')}
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/80 dark:divide-[#00D68F]/10">
              {filteredConversations.map((conv) => {
                const info = getConversationDisplay(conv);
                const isSelected = conv.id === activeConv?.id;
                const typers = typingByConversation[conv.id] || [];
                const unread = unreadByConversation[conv.id] || 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => onSelectConversation(conv.id)}
                    className={`w-full px-3.5 py-3.5 min-h-[72px] flex items-center gap-3 text-left transition-colors ${
                      isSelected
                        ? 'bg-[#00A86B]/12 dark:bg-[#00D68F]/14'
                        : unread > 0
                          ? 'bg-[#00A86B]/6 dark:bg-[#00D68F]/6 hover:bg-slate-100 dark:hover:bg-white/5'
                          : 'hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                  >
                    <PlayerAvatar src={info.avatar} name={info.title} online={info.online} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                          <span className="truncate">{info.title}</span>
                          {info.verified && <VerifiedIcon className="w-3.5 h-3.5 shrink-0" />}
                          {conv.type === 'group' && (
                            <span className="text-[10px] font-medium text-[#008F5B] dark:text-[#00D68F] shrink-0">
                              · {conv.participantIds.length}
                            </span>
                          )}
                        </p>
                        <span
                          className={`text-[10px] shrink-0 tabular-nums ${
                            unread > 0
                              ? 'text-[#008F5B] dark:text-[#00D68F] font-semibold'
                              : 'text-slate-500 dark:text-[#A5B5AC]'
                          }`}
                        >
                          {formatRelativeTime(conv.lastMessageAt || conv.updatedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div
                          className={`text-xs min-w-0 flex-1 ${
                            unread > 0
                              ? 'text-slate-900 dark:text-white font-medium'
                              : 'text-slate-500 dark:text-[#A5B5AC]'
                          }`}
                        >
                          {typers.length > 0 ? (
                            <span className="text-[#008F5B] dark:text-[#00D68F] font-medium">Typing...</span>
                          ) : (
                            renderPreviewSnippet(conv.lastMessageText)
                          )}
                        </div>
                        {unread > 0 && (
                          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] text-[10px] font-bold inline-flex items-center justify-center tabular-nums shrink-0">
                            {unread > 9 ? '9+' : unread}
                          </span>
                        )}
                      </div>

                      {info.subtitle && (
                        <p className="text-[10px] text-slate-400 dark:text-[#7B8C83] truncate mt-0.5">
                          {info.subtitle}
                          {info.online ? ` · ${t('onlineNow')}` : ''}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* Right Active Thread / Desktop Inbox Hub */}
      <section
        className={`md:col-span-7 lg:col-span-8 flex flex-col bg-[#F6F8F7] dark:bg-[#080D0B] md:bg-[#F6F8F7]/80 md:dark:bg-[#080D0B]/70 min-h-0 h-full ${
          activeConv ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!activeConv || !activeDisplay ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-lg space-y-6">
              <div className="card-surface rounded-3xl p-6 text-center space-y-4">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-[#00D68F] to-[#00B87A] text-[#080D0B] flex items-center justify-center shadow-lg">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                    {t('inboxWelcomeTitle')}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-[#A5B5AC] leading-relaxed">
                    {t('inboxWelcomeDesc')}
                  </p>
                </div>

                {/* Live Inbox KPIs */}
                <div className="grid grid-cols-3 gap-2.5 pt-2">
                  <div className="p-3 rounded-2xl inset-surface">
                    <p className="text-lg font-display font-bold text-slate-900 dark:text-white tabular-nums">
                      {conversations.length}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('totalChatsStat')}</p>
                  </div>
                  <div className="p-3 rounded-2xl inset-surface">
                    <p className="text-lg font-display font-bold text-[#00A86B] dark:text-[#00D68F] tabular-nums">
                      {totalUnreadCount}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('unreadStat')}</p>
                  </div>
                  <div className="p-3 rounded-2xl inset-surface">
                    <p className="text-lg font-display font-bold text-slate-900 dark:text-white tabular-nums">
                      {onlinePlayersCount}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{t('onlinePlayersStat')}</p>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                  <button
                    onClick={() => {
                      setPlayerSearch('');
                      setNewChatOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <MessageSquarePlus className="w-4 h-4" />
                    {t('newChatBtn')}
                  </button>
                  <button
                    onClick={() => setNewGroupOpen(true)}
                    className="px-4 py-2.5 rounded-xl inset-surface text-slate-800 dark:text-white hover:border-[#00A86B]/40 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Users className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                    {t('newGroupBtn')}
                  </button>
                  <button
                    onClick={() => setPermissionsOpen(true)}
                    className="px-4 py-2.5 rounded-xl inset-surface text-slate-800 dark:text-white hover:border-[#00A86B]/40 text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                    {t('managePermissions')}
                  </button>
                </div>
              </div>

              {sortedActivePlayers.length > 0 && (
                <div className="card-surface rounded-2xl p-4 space-y-3">
                  <h4 className="text-xs font-display font-semibold text-slate-900 dark:text-white">
                    {t('quickStartPlayers')}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {sortedActivePlayers.slice(0, 4).map((player) => (
                      <button
                        key={player.uid}
                        onClick={() => void handleStartPrivateChat(player)}
                        className="p-2.5 rounded-xl inset-surface hover:border-[#00A86B]/40 dark:hover:border-[#00D68F]/40 flex items-center gap-2.5 text-left transition-colors"
                      >
                        <PlayerAvatar
                          src={player.avatarUrl}
                          name={player.fullName}
                          size="sm"
                          online={onlineUserIds.has(player.uid)}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                            {player.fullName}
                            {player.isVerified && <VerifiedIcon className="w-3 h-3" />}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">
                            {onlineUserIds.has(player.uid) ? t('onlineNow') : `@${player.username}`}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <header className="px-3.5 py-2.5 md:px-4 md:py-3 border-b border-slate-200 dark:border-[#00D68F]/15 bg-white/95 dark:bg-[#101A15]/95 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                <button
                  onClick={() => onSelectConversation(null)}
                  className="md:hidden min-h-[44px] min-w-[44px] rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-800 dark:text-white active:scale-95 transition-transform"
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => {
                    if (activeDisplay.otherUid) onOpenProfile(activeDisplay.otherUid);
                  }}
                  className="flex items-center gap-3 min-w-0 text-left"
                >
                  <PlayerAvatar
                    src={activeDisplay.avatar}
                    name={activeDisplay.title}
                    size="sm"
                    online={activeDisplay.online}
                  />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                      <span className="truncate">{activeDisplay.title}</span>
                      {activeDisplay.verified && <VerifiedIcon className="w-3.5 h-3.5 shrink-0" />}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">
                      {activeTypers.length > 0
                        ? `${activeTypers.map((tp) => tp.name.split(' ')[0]).join(', ')} is typing...`
                        : activeConv.type === 'group'
                          ? `${activeConv.participantIds.length} participants`
                          : activeDisplay.online
                            ? t('onlineNow')
                            : t('offlineStatus')}
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setPermissionsOpen(true)}
                  title={t('appPermissions')}
                  aria-label={t('appPermissions')}
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-[#A5B5AC]"
                >
                  <ShieldCheck className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                </button>
                {activeConv.type === 'group' && (
                  <button
                    onClick={() => setGroupManageOpen(true)}
                    className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-medium text-slate-800 dark:text-white flex items-center gap-1.5"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                    <span className="hidden sm:inline">{t('members')}</span>
                  </button>
                )}
                {activeDisplay.otherUid && (
                  <button
                    onClick={() => void handleBlockOtherUser(activeDisplay.otherUid!)}
                    className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 ${
                      blockedUserIds.includes(activeDisplay.otherUid)
                        ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                        : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {blockedUserIds.includes(activeDisplay.otherUid) ? 'Unblock' : 'Block'}
                    </span>
                  </button>
                )}
              </div>
            </header>

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 space-y-3.5">
              {messages.length === 0 && (
                <div className="text-center py-10 space-y-3">
                  <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">
                    Say hello! Messages sync instantly across connected players.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void handleQuickStarterSend(starter)}
                        className="px-3 py-1.5 rounded-xl inset-surface hover:border-[#00A86B]/50 dark:hover:border-[#00D68F]/40 text-xs text-slate-700 dark:text-[#D5E2DB] transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => {
                const mine = msg.senderId === currentUser.uid;
                const seenByOther = msg.readBy.some((id) => id !== msg.senderId);
                const reactionValues = Object.values(msg.reactions || {});
                const detectedUrls = !msg.deleted && msg.mediaType === 'text' ? extractUrls(msg.text) : [];

                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`group flex flex-col w-full min-w-0 ${mine ? 'items-end' : 'items-start'}`}
                  >
                    {/* Reply, Emoji, Delete Action Bar ABOVE the Message */}
                    {!msg.deleted && (
                      <div
                        className={`relative flex items-center gap-1 mb-1 ${
                          mine ? 'justify-end' : 'justify-start ml-9'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setReplyTo(msg)}
                          className="h-7 px-2 rounded-lg bg-white/95 dark:bg-[#101A15]/95 border border-slate-200 dark:border-[#00D68F]/20 text-[11px] font-medium text-slate-700 dark:text-[#D5E2DB] hover:border-[#00A86B] dark:hover:border-[#00D68F] shadow-xs inline-flex items-center gap-1 transition-colors"
                          title={t('replyAction')}
                        >
                          <Reply className="w-3 h-3 text-[#00A86B] dark:text-[#00D68F]" />
                          <span>{t('replyAction')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReactingMsgId((cur) => (cur === msg.id ? null : msg.id))}
                          className="h-7 px-2 rounded-lg bg-white/95 dark:bg-[#101A15]/95 border border-slate-200 dark:border-[#00D68F]/20 text-[11px] font-medium text-slate-700 dark:text-[#D5E2DB] hover:border-[#00A86B] dark:hover:border-[#00D68F] shadow-xs inline-flex items-center gap-1 transition-colors"
                          title={t('emojiAction')}
                        >
                          <Smile className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                          <span>{t('emojiAction')}</span>
                        </button>
                        {mine && (
                          <button
                            type="button"
                            onClick={() => void deleteOwnMessage(activeConv.id, msg.id)}
                            className="h-7 px-2 rounded-lg bg-white/95 dark:bg-[#101A15]/95 border border-rose-200 dark:border-rose-500/25 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 shadow-xs inline-flex items-center gap-1 transition-colors"
                            title={t('deleteAction')}
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t('deleteAction')}</span>
                          </button>
                        )}

                        {reactingMsgId === msg.id && (
                          <div
                            className={`absolute bottom-full mb-1.5 z-20 flex items-center gap-1 p-1.5 rounded-xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/25 shadow-xl ${
                              mine ? 'right-0' : 'left-0'
                            }`}
                          >
                            {['👍', '❤️', '🔥', '😂', '🎯', '👏'].map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                  setReactingMsgId(null);
                                  void reactToMessage(activeConv.id, msg, currentUser.uid, emoji);
                                }}
                                className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 text-sm flex items-center justify-center"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Avatar + Message Bubble Row */}
                    <div
                      className={`flex items-end gap-2 max-w-[90%] sm:max-w-[78%] min-w-0 ${
                        mine ? 'flex-row-reverse' : ''
                      }`}
                    >
                      {!mine && <PlayerAvatar src={msg.senderAvatar} name={msg.senderName} size="xs" />}

                      <div
                        className={`relative min-w-0 max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-sm shadow-sm text-white ${
                          mine
                            ? 'bg-gradient-to-br from-[#009960] to-[#007348] rounded-br-sm'
                            : 'bg-[#1B2B23] dark:bg-[#14221B] border border-[#00D68F]/20 rounded-bl-sm'
                        }`}
                      >
                        {activeConv.type === 'group' && !mine && (
                          <p className="text-[11px] font-semibold text-[#34D399] mb-1 truncate">
                            {msg.senderName}
                          </p>
                        )}

                        {msg.replyToText && !msg.deleted && (
                          <div className="mb-1.5 px-2.5 py-1.5 rounded-xl text-xs bg-black/25 border border-white/10 text-white/95 min-w-0">
                            <p className="font-semibold text-[10px] text-[#86EFAC] truncate">
                              {msg.replyToSender}
                            </p>
                            <p className="line-clamp-2 [overflow-wrap:anywhere] break-words text-white/85">
                              {msg.replyToText}
                            </p>
                          </div>
                        )}

                        {msg.deleted ? (
                          <p className="italic text-xs text-white/75">This message was deleted</p>
                        ) : (
                          <>
                            {msg.mediaType === 'image' && msg.mediaUrl && (
                              <img
                                src={msg.mediaUrl}
                                alt="Shared attachment"
                                className="rounded-xl max-h-72 w-auto max-w-full object-cover mb-1.5"
                              />
                            )}
                            {msg.mediaType === 'video' && msg.mediaUrl && (
                              <video
                                src={msg.mediaUrl}
                                controls
                                className="rounded-xl max-h-72 w-full max-w-[300px] mb-1.5"
                              />
                            )}
                            {msg.mediaType === 'voice' && msg.mediaUrl && (
                              <div className="flex items-center gap-2 py-0.5 min-w-0 max-w-full">
                                <Mic className="w-4 h-4 text-[#A7F3D0] shrink-0" />
                                <audio
                                  src={msg.mediaUrl}
                                  controls
                                  className="max-w-[230px] sm:max-w-[260px] h-9"
                                />
                              </div>
                            )}
                            {msg.text && msg.mediaType === 'text' && (
                              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed text-white">
                                {renderMessageTextWithLinks(msg.text)}
                              </p>
                            )}

                            {detectedUrls.length > 0 && (
                              <a
                                href={detectedUrls[0].href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 px-2.5 py-2 rounded-xl bg-black/25 hover:bg-black/35 border border-white/15 flex items-center justify-between gap-2 text-xs text-white transition-colors min-w-0"
                              >
                                <span className="inline-flex items-center gap-1.5 min-w-0">
                                  <Globe className="w-3.5 h-3.5 text-[#86EFAC] shrink-0" />
                                  <span className="truncate font-medium">{detectedUrls[0].hostname}</span>
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#86EFAC] shrink-0">
                                  <span>{t('openLink')}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </span>
                              </a>
                            )}
                          </>
                        )}

                        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/80">
                          <span>{formatRelativeTime(msg.createdAt)}</span>
                          {mine &&
                            (seenByOther ? (
                              <CheckCheck className="w-3.5 h-3.5 text-[#B9F6CA]" aria-label="Seen" />
                            ) : (
                              <Check className="w-3.5 h-3.5 text-white/80" aria-label="Delivered" />
                            ))}
                        </div>

                        {reactionValues.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-0.5 text-xs bg-black/30 border border-white/15 rounded-full px-2 py-0.5 w-fit text-white shadow-sm">
                            {Array.from(new Set(reactionValues)).map((e) => (
                              <span key={e}>{e}</span>
                            ))}
                            <span className="text-[10px] text-white/80 ml-1 tabular-nums">
                              {reactionValues.length}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Preview Banner */}
            {replyTo && (
              <div className="px-4 py-2 bg-white dark:bg-[#101A15] border-t border-slate-200 dark:border-[#00D68F]/15 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-[#008F5B] dark:text-[#00D68F]">
                    Replying to {replyTo.senderName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-[#A5B5AC] truncate">
                    {replyTo.text || replyTo.mediaType}
                  </p>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="p-1 text-slate-400 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Hidden gallery file input (for camera modal fallback too) */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                void handleSendMedia(e.target.files?.[0], 'image');
                e.currentTarget.value = '';
              }}
              className="hidden"
            />

            {/* Message Input Bar */}
            <form
              onSubmit={handleSendText}
              className="px-2.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] md:p-3 border-t border-slate-200 dark:border-[#00D68F]/15 bg-white/95 dark:bg-[#101A15]/95 flex items-end gap-1.5 md:gap-2 relative shrink-0"
            >
              {/* Emoji Popover */}
              <AnimatePresence>
                {emojiOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full left-3 mb-2 p-2 rounded-2xl card-surface shadow-2xl flex flex-wrap gap-1.5 max-w-[260px] z-30"
                  >
                    {EMOJI_PALETTE.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setMessageInput((v) => `${v}${emoji}`)}
                        className="h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-white/10 text-lg"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Media Attachment Popover */}
              <AnimatePresence>
                {attachOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute bottom-full left-12 mb-2 p-2 rounded-2xl card-surface shadow-2xl flex flex-col gap-1 w-52 z-30"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setAttachOpen(false);
                        setCameraModalOpen(true);
                      }}
                      className="px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-slate-800 dark:text-white flex items-center gap-2 text-left"
                    >
                      <Camera className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
                      <span className="truncate">{t('cameraPhoto')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachOpen(false);
                        galleryInputRef.current?.click();
                      }}
                      className="px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-slate-800 dark:text-white flex items-center gap-2 text-left"
                    >
                      <Camera className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
                      <span className="truncate">{t('galleryPhoto')}</span>
                    </button>
                    <label className="px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-slate-800 dark:text-white cursor-pointer flex items-center gap-2">
                      <Film className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
                      <span className="truncate">{t('shareVideo')}</span>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          void handleSendMedia(e.target.files?.[0], 'video');
                          e.currentTarget.value = '';
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachOpen(false);
                        setPermissionsOpen(true);
                      }}
                      className="px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-xs text-[#008F5B] dark:text-[#00D68F] font-medium flex items-center gap-2 text-left border-t border-slate-200 dark:border-[#00D68F]/15 mt-0.5 pt-2.5"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span className="truncate">{t('appPermissions')}</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {recording ? (
                <div className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-rose-500/12 dark:bg-rose-500/15 border border-rose-500/30 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
                    <span className="text-xs font-semibold text-rose-600 dark:text-rose-300 truncate">
                      {t('recordingVoice')}
                    </span>
                    <span className="text-xs font-mono-tabular font-bold text-slate-900 dark:text-white shrink-0">
                      {formatDuration(recordingSeconds)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => stopVoiceRecord(true)}
                      className="px-2.5 py-1.5 rounded-lg bg-white/80 dark:bg-white/10 text-xs font-medium text-slate-700 dark:text-white"
                    >
                      {t('recordingCancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => stopVoiceRecord(false)}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] text-xs font-bold inline-flex items-center gap-1"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      {t('recordingSend')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEmojiOpen((v) => !v);
                      setAttachOpen(false);
                    }}
                    className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white flex items-center justify-center shrink-0"
                    aria-label="Emoji picker"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAttachOpen((v) => !v);
                      setEmojiOpen(false);
                    }}
                    className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white flex items-center justify-center shrink-0"
                    aria-label="Attach photo or video"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>

                  <textarea
                    ref={composerRef}
                    rows={1}
                    maxLength={2000}
                    value={messageInput}
                    onChange={(e) => handleTypingChange(e.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder={t('typeMessage')}
                    disabled={uploadingMedia}
                    className="flex-1 min-w-0 min-h-[44px] max-h-28 px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F] resize-none leading-snug"
                  />

                  <button
                    type="button"
                    onClick={() => void startVoiceRecord()}
                    disabled={uploadingMedia}
                    className="min-h-[44px] min-w-[44px] rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white flex items-center justify-center shrink-0 transition-colors"
                    aria-label="Record voice message"
                    title={t('micPermTitle')}
                  >
                    <Mic className="w-5 h-5" />
                  </button>

                  <button
                    type="submit"
                    disabled={!messageInput.trim() || sending || uploadingMedia}
                    className="min-h-[44px] min-w-[44px] px-3.5 sm:px-4 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold flex items-center justify-center shrink-0 disabled:opacity-40"
                    aria-label="Send message"
                  >
                    {uploadingMedia || sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </>
              )}
            </form>
          </>
        )}
      </section>

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

      {/* Live Camera Photo Capture Modal */}
      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCaptureFile={(file) => void handleSendMedia(file, 'image')}
        onFallbackGallery={() => galleryInputRef.current?.click()}
      />

      {/* New Private Chat Modal */}
      <ModalDialog
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        title={t('newChatBtn')}
        subtitle="Pick any Carrom Hub player to message privately."
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 dark:text-[#A5B5AC] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder={t('searchPlayersPlaceholder')}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl inset-surface text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
            />
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filteredModalUsers.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-[#A5B5AC] py-4 text-center">No matching players found.</p>
            ) : (
              filteredModalUsers.map((u) => (
                <button
                  key={u.uid}
                  onClick={() => void handleStartPrivateChat(u)}
                  className="w-full p-3 rounded-xl inset-surface hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-3 text-left transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar src={u.avatarUrl} name={u.fullName} size="sm" online={onlineUserIds.has(u.uid)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{u.fullName}</p>
                      <p className="text-xs text-slate-500 dark:text-[#A5B5AC] truncate">@{u.username}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-[#008F5B] dark:text-[#00D68F]">{t('messageBtn')}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </ModalDialog>

      {/* Create Group Chat Modal */}
      <ModalDialog
        open={newGroupOpen}
        onClose={() => setNewGroupOpen(false)}
        title="Create Group Chat"
        subtitle="Build a squad chat with your Carrom teammates."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateGroupChat} className="space-y-4">
          <input
            type="text"
            required
            maxLength={80}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Squad / Group Chat Name"
            className="w-full px-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
          />
          <div className="space-y-2 max-h-56 overflow-y-auto">
            <p className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Select Members</p>
            {otherUsers.map((u) => {
              const checked = selectedMemberIds.includes(u.uid);
              return (
                <label
                  key={u.uid}
                  className="p-2.5 rounded-xl inset-surface flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar src={u.avatarUrl} name={u.fullName} size="xs" />
                    <span className="text-xs font-medium text-slate-900 dark:text-white truncate">{u.fullName}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedMemberIds((prev) =>
                        checked ? prev.filter((id) => id !== u.uid) : [...prev, u.uid]
                      )
                    }
                    className="accent-[#00D68F]"
                  />
                </label>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={!groupName.trim() || selectedMemberIds.length === 0}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm disabled:opacity-40"
          >
            Create Group Chat
          </button>
        </form>
      </ModalDialog>

      {/* Group Admin Controls Modal */}
      {activeConv && activeConv.type === 'group' && (
        <ModalDialog
          open={groupManageOpen}
          onClose={() => setGroupManageOpen(false)}
          title="Group Chat Members"
          subtitle={
            activeConv.adminId === currentUser.uid
              ? 'You are the group admin. Add or remove participants.'
              : 'Current participants in this group chat.'
          }
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {activeConv.participantIds.map((pid) => {
                const prof = activeConv.participantProfiles?.[pid];
                const u = users.find((x) => x.uid === pid);
                const name = u?.fullName || prof?.fullName || 'Player';
                const isAdmin = pid === activeConv.adminId;
                return (
                  <div key={pid} className="p-2.5 rounded-xl inset-surface flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={u?.avatarUrl || prof?.avatarUrl} name={name} size="xs" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC]">{isAdmin ? 'Admin' : 'Member'}</p>
                      </div>
                    </div>
                    {activeConv.adminId === currentUser.uid && !isAdmin && (
                      <button
                        onClick={() => void handleGroupMemberUpdate(pid, false)}
                        className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25"
                        title="Remove member"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {activeConv.adminId === currentUser.uid && (
              <div className="pt-3 border-t border-slate-200 dark:border-[#00D68F]/15 space-y-2">
                <p className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Add Players to Group</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {otherUsers
                    .filter((u) => !activeConv.participantIds.includes(u.uid))
                    .map((u) => (
                      <div key={u.uid} className="p-2 rounded-xl inset-surface flex items-center justify-between gap-2">
                        <span className="text-xs text-slate-900 dark:text-white truncate">{u.fullName}</span>
                        <button
                          onClick={() => void handleGroupMemberUpdate(u.uid, true)}
                          className="px-2.5 py-1 rounded-lg bg-[#00A86B]/15 dark:bg-[#00D68F]/15 text-[#008F5B] dark:text-[#00D68F] text-xs font-medium flex items-center gap-1"
                        >
                          <UserPlus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
