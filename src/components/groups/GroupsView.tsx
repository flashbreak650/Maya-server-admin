import {
  ArrowLeft,
  Camera,
  Globe,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Send,
  ShieldCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { CARROM_ASSETS } from '../../lib/assets';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl } from '../../lib/media';
import {
  createCommunityGroup,
  createPost,
  joinCommunityGroup,
  leaveOrRemoveGroupMember,
  subscribeToGroupMembers,
} from '../../services/firestoreService';
import type { CommunityGroup, GroupMember, Post, UserPublicProfile } from '../../types';
import { PostCard } from '../feed/PostCard';
import { EmptyState, ModalDialog, PlayerAvatar } from '../ui/ToastAndDialogs';

interface GroupsViewProps {
  currentUser: UserPublicProfile;
  groups: CommunityGroup[];
  posts: Post[];
  onlineUserIds: Set<string>;
  onOpenGroupChat: (conversationId: string) => void;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function GroupsView({
  currentUser,
  groups,
  posts,
  onlineUserIds,
  onOpenGroupChat,
  onOpenProfile,
  onToast,
}: GroupsViewProps) {
  const { t } = usePreferences();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Create group form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [logoUrl, setLogoUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Group post composer
  const [groupPostCaption, setGroupPostCaption] = useState('');
  const [groupPostImage, setGroupPostImage] = useState('');
  const [posting, setPosting] = useState(false);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  useEffect(() => {
    if (!selectedGroup) {
      setMembers([]);
      return;
    }
    const unsub = subscribeToGroupMembers(selectedGroup.id, setMembers);
    return () => unsub();
  }, [selectedGroup?.id]);

  const isMember = members.some((m) => m.userId === currentUser.uid);
  const isGroupAdmin = selectedGroup?.adminId === currentUser.uid;

  const handleUploadImage = async (file: File | undefined, target: 'logo' | 'cover' | 'post') => {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, target === 'logo' ? 420 : 1200, 0.8);
      if (target === 'logo') setLogoUrl(compressed);
      else if (target === 'cover') setCoverUrl(compressed);
      else setGroupPostImage(compressed);
    } catch {
      onToast('error', 'Image processing failed');
    }
  };

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      onToast('error', 'Group name must be at least 2 characters');
      return;
    }
    if (creating) return;
    setCreating(true);
    try {
      const created = await createCommunityGroup({
        admin: currentUser,
        name,
        description,
        privacy,
        logoUrl: logoUrl || undefined,
        coverUrl: coverUrl || undefined,
      });
      setCreateOpen(false);
      setName('');
      setDescription('');
      setLogoUrl('');
      setCoverUrl('');
      setSelectedGroupId(created.id);
      onToast('success', 'Community group created');
    } catch {
      onToast('error', 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (group: CommunityGroup) => {
    try {
      await joinCommunityGroup(group, currentUser);
      onToast('success', `Joined ${group.name}`);
    } catch {
      onToast('error', 'Unable to join group');
    }
  };

  const handleLeaveOrRemove = async (group: CommunityGroup, uid: string) => {
    try {
      await leaveOrRemoveGroupMember(group, uid);
      onToast('info', uid === currentUser.uid ? 'Left group' : 'Member removed');
    } catch {
      onToast('error', 'Action failed');
    }
  };

  const handleGroupPost = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || (!groupPostCaption.trim() && !groupPostImage) || posting) return;
    setPosting(true);
    try {
      await createPost({
        author: currentUser,
        caption: groupPostCaption,
        mediaUrl: groupPostImage || undefined,
        mediaType: groupPostImage ? 'image' : 'none',
        audience: 'group',
        groupId: selectedGroup.id,
        groupName: selectedGroup.name,
      });
      setGroupPostCaption('');
      setGroupPostImage('');
      onToast('success', 'Posted to group');
    } catch {
      onToast('error', 'Could not post to group');
    } finally {
      setPosting(false);
    }
  };

  if (selectedGroup) {
    const groupPosts = posts.filter((p) => p.groupId === selectedGroup.id);

    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedGroupId(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToClubs')}
        </button>

        {/* Group Banner Card */}
        <section className="card-surface rounded-3xl overflow-hidden">
          <div className="h-44 sm:h-52 relative bg-slate-200 dark:bg-[#080D0B]">
            <img
              src={selectedGroup.coverUrl || CARROM_ASSETS.clubCover}
              alt={selectedGroup.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#14221B] via-white/20 dark:via-[#14221B]/30 to-transparent" />
          </div>

          <div className="p-5 sm:p-6 -mt-12 relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="h-20 w-20 rounded-2xl border-4 border-white dark:border-[#14221B] inset-surface shadow-md overflow-hidden flex items-center justify-center shrink-0">
                {selectedGroup.logoUrl ? (
                  <img src={selectedGroup.logoUrl} alt={selectedGroup.name} className="h-full w-full object-cover" />
                ) : (
                  <Users className="w-8 h-8 text-[#00A86B] dark:text-[#00D68F]" />
                )}
              </div>
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{selectedGroup.name}</h1>
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] mt-1 flex items-center gap-1.5">
                  {selectedGroup.privacy === 'private' ? (
                    <Lock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  ) : (
                    <Globe className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                  )}
                  <span className="capitalize">{selectedGroup.privacy} Group</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">
                    {selectedGroup.membersCount} {t('members')}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {isMember && (
                <button
                  onClick={() => onOpenGroupChat(selectedGroup.conversationId)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs inline-flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {t('openGroupChat')}
                </button>
              )}
              {!isMember && selectedGroup.privacy === 'public' && (
                <button
                  onClick={() => void handleJoin(selectedGroup)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs"
                >
                  {t('joinGroup')}
                </button>
              )}
              {isMember && !isGroupAdmin && (
                <button
                  onClick={() => void handleLeaveOrRemove(selectedGroup, currentUser.uid)}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-300 text-xs font-medium transition-colors"
                >
                  {t('leaveGroup')}
                </button>
              )}
            </div>
          </div>

          <div className="px-5 sm:px-6 pb-6 pt-2">
            <p className="text-sm text-slate-700 dark:text-[#D5E2DB] leading-relaxed">{selectedGroup.description}</p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Group Posts */}
          <div className="lg:col-span-8 space-y-4">
            {isMember && (
              <form onSubmit={handleGroupPost} className="card-surface rounded-2xl p-4 space-y-3">
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={groupPostCaption}
                  onChange={(e) => setGroupPostCaption(e.target.value)}
                  placeholder={`Share an update with ${selectedGroup.name}...`}
                  className="w-full p-3 rounded-xl inset-surface text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F] resize-none"
                />
                {groupPostImage && (
                  <img src={groupPostImage} alt="Group upload" className="max-h-56 rounded-xl object-cover" />
                )}
                <div className="flex items-center justify-between">
                  <label className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs text-slate-800 dark:text-white cursor-pointer inline-flex items-center gap-1.5 transition-colors">
                    <Camera className="w-4 h-4 text-[#00A86B] dark:text-[#00D68F]" />
                    {t('photo')}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleUploadImage(e.target.files?.[0], 'post')}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={(!groupPostCaption.trim() && !groupPostImage) || posting}
                    className="px-4 py-2 rounded-xl bg-[#00D68F] text-[#080D0B] font-semibold text-xs inline-flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {t('postToClub')}
                  </button>
                </div>
              </form>
            )}

            {groupPosts.length === 0 ? (
              <EmptyState
                icon={<Users className="w-6 h-6" />}
                title="No group posts yet"
                description="Join the club and share match recaps or strategy tips."
              />
            ) : (
              groupPosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUser={currentUser}
                  isOnline={onlineUserIds.has(post.authorId)}
                  onOpenProfile={onOpenProfile}
                  onToast={onToast}
                />
              ))
            )}
          </div>

          {/* Members List & Admin Controls */}
          <aside className="lg:col-span-4 card-surface rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-semibold text-slate-900 dark:text-white">{t('clubMembers')}</h2>
              <span className="text-xs text-slate-500 dark:text-[#A5B5AC] tabular-nums">{members.length}</span>
            </div>
            <div className="space-y-2.5 max-h-96 overflow-y-auto">
              {members.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-2 p-2 rounded-xl inset-surface">
                  <button
                    onClick={() => onOpenProfile(m.userId)}
                    className="flex items-center gap-2.5 min-w-0 text-left"
                  >
                    <PlayerAvatar
                      src={m.avatarUrl}
                      name={m.fullName}
                      size="xs"
                      online={onlineUserIds.has(m.userId)}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        {m.fullName}
                        {m.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">@{m.username}</p>
                    </div>
                  </button>

                  {isGroupAdmin && m.userId !== currentUser.uid && (
                    <button
                      onClick={() => void handleLeaveOrRemove(selectedGroup, m.userId)}
                      title="Remove member"
                      className="p-1.5 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 hover:bg-rose-500/25"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('groupsTitle')}</h1>
          <p className="text-sm text-slate-600 dark:text-[#A5B5AC] mt-1">{t('groupsSub')}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm inline-flex items-center gap-2 w-fit"
        >
          <Plus className="w-4 h-4" />
          {t('createGroup')}
        </button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="No Carrom clubs yet"
          description="Be the first captain to launch a Carrom community group and invite players."
          action={
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-[#00D68F] text-[#080D0B] font-semibold text-xs"
            >
              {t('createGroup')}
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((group) => (
            <div
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              className="card-surface rounded-2xl overflow-hidden cursor-pointer hover:border-[#00A86B]/40 dark:hover:border-[#00D68F]/40 transition-all group flex flex-col"
            >
              <div className="h-32 relative bg-slate-200 dark:bg-[#080D0B] overflow-hidden">
                <img
                  src={group.coverUrl || CARROM_ASSETS.clubCover}
                  alt={group.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#14221B] via-transparent to-transparent" />
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 -mt-8 relative z-10 rounded-xl border-2 border-white dark:border-[#14221B] inset-surface shadow-sm overflow-hidden flex items-center justify-center shrink-0">
                    {group.logoUrl ? (
                      <img src={group.logoUrl} alt={group.name} className="h-full w-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-[#00A86B] dark:text-[#00D68F]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white truncate">
                      {group.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-[#A5B5AC] tabular-nums">
                      {group.membersCount} {t('members')} · {group.privacy}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] line-clamp-2 leading-relaxed">
                  {group.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Group Modal */}
      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Carrom Community"
        subtitle="Set up your club identity, privacy, and squad chat."
      >
        <form onSubmit={handleCreateGroup} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Group Name</label>
            <input
              type="text"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dhaka Strikers Club"
              className="w-full px-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Description</label>
            <textarea
              rows={3}
              required
              maxLength={600}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Friendly matches, trick-shot discussions, and weekly club qualifiers..."
              className="w-full p-3.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="p-3 rounded-xl inset-surface text-xs text-slate-900 dark:text-white cursor-pointer text-center font-medium">
              {logoUrl ? 'Logo Selected' : 'Upload Group Logo'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleUploadImage(e.target.files?.[0], 'logo')}
                className="hidden"
              />
            </label>
            <label className="p-3 rounded-xl inset-surface text-xs text-slate-900 dark:text-white cursor-pointer text-center font-medium">
              {coverUrl ? 'Cover Selected' : 'Upload Group Cover'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleUploadImage(e.target.files?.[0], 'cover')}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Group Privacy</label>
            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'private')}
              className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            >
              <option value="public">Public (Anyone can join)</option>
              <option value="private">Private (Invite / Admin managed)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Community Group
          </button>
        </form>
      </ModalDialog>
    </div>
  );
}
