import {
  Edit3,
  Flag,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState, type FormEvent } from 'react';
import { usePreferences } from '../../lib/i18n';
import { formatRelativeTime } from '../../lib/media';
import {
  addComment,
  deletePost,
  editPost,
  incrementShareCount,
  submitReport,
  subscribeToComments,
  subscribeToPostReactions,
  togglePostReaction,
} from '../../services/firestoreService';
import type { Post, PostComment, ReactionType, UserPublicProfile } from '../../types';
import { ConfirmDialog, ModalDialog, PlayerAvatar, VerifiedIcon } from '../ui/ToastAndDialogs';

const REACTIONS: { type: ReactionType; label: string; emoji: string; color: string }[] = [
  { type: 'like', label: 'Like', emoji: '👍', color: 'text-[#00A86B] dark:text-[#00D68F]' },
  { type: 'queen', label: 'Red Queen', emoji: '🔴', color: 'text-rose-500 dark:text-rose-400' },
  { type: 'fire', label: 'On Fire', emoji: '🔥', color: 'text-amber-500 dark:text-amber-400' },
  { type: 'clap', label: 'Well Played', emoji: '👏', color: 'text-sky-600 dark:text-sky-400' },
  { type: 'wow', label: 'Amazing Shot', emoji: '🤯', color: 'text-violet-600 dark:text-violet-400' },
];

interface PostCardProps {
  post: Post;
  currentUser: UserPublicProfile;
  isOnline?: boolean;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function PostCard({
  post,
  currentUser,
  isOnline,
  onOpenProfile,
  onToast,
}: PostCardProps) {
  const { t } = usePreferences();
  const [reactions, setReactions] = useState<Record<string, ReactionType>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editCaption, setEditCaption] = useState(post.caption);
  const [editAudience, setEditAudience] = useState<'public' | 'friends' | 'group'>(post.audience);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading');
  const [reportDetails, setReportDetails] = useState('');

  const isOwner = post.authorId === currentUser.uid;
  const myReaction = reactions[currentUser.uid];
  const activeReactionMeta = REACTIONS.find((r) => r.type === myReaction);

  useEffect(() => {
    const unsub = subscribeToPostReactions(post.id, setReactions);
    return () => unsub();
  }, [post.id]);

  useEffect(() => {
    if (!commentsOpen) return;
    const unsub = subscribeToComments(post.id, setComments);
    return () => unsub();
  }, [commentsOpen, post.id]);

  const handleReact = async (type: ReactionType) => {
    setPickerOpen(false);
    try {
      await togglePostReaction(post, currentUser, type, reactions);
    } catch {
      onToast('error', 'Reaction failed', 'Unable to update reaction right now.');
    }
  };

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || sendingComment) return;
    setSendingComment(true);
    try {
      await addComment(post, currentUser, commentText);
      setCommentText('');
    } catch {
      onToast('error', 'Comment failed', 'Could not publish your comment.');
    } finally {
      setSendingComment(false);
    }
  };

  const handleShare = async () => {
    try {
      await incrementShareCount(post);
      const url = `${window.location.origin}/?post=${post.id}`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
      onToast('success', 'Post shared', 'Post link copied to clipboard.');
    } catch {
      onToast('error', 'Share failed');
    }
  };

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      await editPost(post.id, { caption: editCaption, audience: editAudience });
      setEditOpen(false);
      onToast('success', 'Post updated');
    } catch {
      onToast('error', 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePost(post, currentUser.uid);
      setDeleteConfirmOpen(false);
      onToast('success', 'Post deleted');
    } catch {
      onToast('error', 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleReportSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await submitReport({
        reporterId: currentUser.uid,
        targetType: 'post',
        targetId: post.id,
        reason: reportReason,
        details: reportDetails,
      });
      setReportOpen(false);
      setReportDetails('');
      onToast('success', 'Report submitted', 'Our moderation team will review this post.');
    } catch {
      onToast('error', 'Failed to submit report');
    }
  };

  const summaryItems = Object.entries(post.reactionSummary || {}).filter(([, count]) => count > 0);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-surface rounded-2xl p-3 sm:p-3.5 space-y-2 transition-colors hover:border-[#00A86B]/30 dark:hover:border-[#00D68F]/25"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button onClick={() => onOpenProfile(post.authorId)} className="shrink-0">
            <PlayerAvatar src={post.authorAvatar} name={post.authorName} size="sm" online={isOnline} />
          </button>
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                onClick={() => onOpenProfile(post.authorId)}
                className="font-semibold text-[13px] text-slate-900 dark:text-white hover:text-[#00A86B] dark:hover:text-[#00D68F] transition-colors truncate"
              >
                {post.authorName}
              </button>
              {post.authorVerified && <VerifiedIcon className="w-3.5 h-3.5" />}
              <span className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">
                @{post.authorUsername}
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-[#A5B5AC] mt-0.5">
              <span>{formatRelativeTime(post.createdAt)}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">
                {post.audience === 'group' && post.groupName ? post.groupName : post.audience}
              </span>
            </div>
          </div>
        </div>

        {/* Actions Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            aria-label="Post options"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                className="absolute right-0 top-9 z-20 w-40 rounded-xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/20 shadow-xl py-1"
              >
                {isOwner ? (
                  <>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setEditCaption(post.caption);
                        setEditAudience(post.audience);
                        setEditOpen(true);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs font-medium text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                      {t('editPost')}
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteConfirmOpen(true);
                      }}
                      className="w-full px-3 py-1.5 text-left text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {t('deletePost')}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setReportOpen(true);
                    }}
                    className="w-full px-3 py-1.5 text-left text-xs font-medium text-amber-600 dark:text-amber-300 hover:bg-slate-100 dark:hover:bg-white/5 flex items-center gap-2"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    {t('reportPost')}
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Compact Caption */}
      {post.caption && (
        <p className="text-[13.5px] sm:text-sm text-slate-800 dark:text-white/95 leading-snug whitespace-pre-wrap break-words">
          {post.caption}
        </p>
      )}

      {/* Compact Media */}
      {post.mediaType === 'image' && post.mediaUrl && (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#00D68F]/15 bg-slate-100 dark:bg-[#080D0B]">
          <img
            src={post.mediaUrl}
            alt="Post attachment"
            referrerPolicy="no-referrer"
            className="w-full max-h-[250px] sm:max-h-[280px] object-cover"
          />
        </div>
      )}

      {post.mediaType === 'video' && post.mediaUrl && (
        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#00D68F]/15 bg-slate-900 dark:bg-[#080D0B]">
          <video src={post.mediaUrl} controls playsInline className="w-full max-h-[240px]" />
        </div>
      )}

      {/* Compact Stats Summary Line */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-[#A5B5AC] pt-1 border-t border-slate-200/80 dark:border-[#00D68F]/10">
        <div className="flex items-center gap-1.5">
          {summaryItems.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              {summaryItems.map(([type]) => {
                const meta = REACTIONS.find((r) => r.type === type);
                return meta ? <span key={type}>{meta.emoji}</span> : null;
              })}
            </span>
          )}
          <span className="tabular-nums">
            {post.likesCount || 0} {t('reactions')}
          </span>
        </div>
        <div className="flex items-center gap-2.5 tabular-nums">
          <button
            onClick={() => setCommentsOpen((v) => !v)}
            className="hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {post.commentsCount || 0} {t('commentsWord')}
          </button>
          <span aria-hidden="true">·</span>
          <span>
            {post.sharesCount || 0} {t('sharesWord')}
          </span>
        </div>
      </div>

      {/* Compact Action Buttons */}
      <div className="relative grid grid-cols-3 gap-1 pt-0.5 border-t border-slate-200/80 dark:border-[#00D68F]/10">
        {/* Reaction Trigger */}
        <div
          className="relative"
          onMouseEnter={() => setPickerOpen(true)}
          onMouseLeave={() => setPickerOpen(false)}
        >
          <button
            onClick={() => void handleReact(myReaction || 'like')}
            className={`w-full min-h-[34px] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
              activeReactionMeta
                ? `${activeReactionMeta.color} bg-[#00A86B]/10 dark:bg-[#00D68F]/10`
                : 'text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {activeReactionMeta ? (
              <span className="text-sm leading-none">{activeReactionMeta.emoji}</span>
            ) : (
              <ThumbsUp className="w-3.5 h-3.5" />
            )}
            <span className="whitespace-nowrap">
              {activeReactionMeta ? activeReactionMeta.label : t('like')}
            </span>
          </button>

          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.94 }}
                transition={{ duration: 0.14 }}
                className="absolute bottom-full left-0 mb-1.5 z-30 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-white dark:bg-[#101A15] border border-slate-200 dark:border-[#00D68F]/25 shadow-2xl"
              >
                {REACTIONS.map((r) => (
                  <button
                    key={r.type}
                    type="button"
                    onClick={() => void handleReact(r.type)}
                    title={r.label}
                    className="h-8 w-8 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 hover:scale-125 transition-transform flex items-center justify-center text-base"
                  >
                    {r.emoji}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={() => setCommentsOpen((v) => !v)}
          className="w-full min-h-[34px] rounded-lg text-xs font-medium text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{t('comment')}</span>
        </button>

        <button
          onClick={handleShare}
          className="w-full min-h-[34px] rounded-lg text-xs font-medium text-slate-600 dark:text-[#A5B5AC] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>{t('share')}</span>
        </button>
      </div>

      {/* Comments Section */}
      <AnimatePresence>
        {commentsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden pt-2 border-t border-slate-200/80 dark:border-[#00D68F]/10 space-y-2.5"
          >
            <form onSubmit={handleCommentSubmit} className="flex items-center gap-2">
              <PlayerAvatar src={currentUser.avatarUrl} name={currentUser.fullName} size="xs" />
              <input
                type="text"
                maxLength={800}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t('writeComment')}
                className="flex-1 px-3 py-1.5 rounded-xl inset-surface text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-[#64746B] focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || sendingComment}
                className="min-h-[32px] px-3 rounded-xl bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B] font-semibold text-xs flex items-center gap-1 disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            {comments.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC] text-center py-1.5">
                {t('noCommentsYet')}
              </p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <button onClick={() => onOpenProfile(c.authorId)} className="shrink-0">
                      <PlayerAvatar src={c.authorAvatar} name={c.authorName} size="xs" />
                    </button>
                    <div className="flex-1 rounded-xl inset-surface px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenProfile(c.authorId)}
                          className="text-xs font-semibold text-slate-900 dark:text-white hover:text-[#00A86B] dark:hover:text-[#00D68F]"
                        >
                          {c.authorName}
                        </button>
                        <span className="text-[10px] text-slate-400 dark:text-[#64746B]">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 dark:text-[#D5E2DB] mt-0.5 leading-relaxed break-words">
                        {c.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Post Modal */}
      <ModalDialog open={editOpen} onClose={() => setEditOpen(false)} title={t('editPost')} maxWidth="max-w-md">
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <textarea
            rows={4}
            maxLength={2000}
            value={editCaption}
            onChange={(e) => setEditCaption(e.target.value)}
            className="w-full p-3.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
          />
          {post.audience !== 'group' && (
            <select
              value={editAudience}
              onChange={(e) => setEditAudience(e.target.value as 'public' | 'friends')}
              className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            >
              <option value="public">{t('publicAudience')}</option>
              <option value="friends">{t('friendsAudience')}</option>
            </select>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="px-4 py-2 rounded-xl text-sm text-slate-600 dark:text-[#A5B5AC] bg-slate-100 dark:bg-white/5"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={savingEdit}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#00A86B] dark:bg-[#00D68F] text-white dark:text-[#080D0B]"
            >
              {savingEdit ? '...' : t('saveChanges')}
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('deletePost')}
        description="Are you sure you want to permanently remove this post from Carrom Hub?"
        confirmLabel={t('deletePost')}
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {/* Report Modal */}
      <ModalDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={t('reportPost')}
        subtitle="Help keep Carrom Hub respectful and authentic."
        maxWidth="max-w-md"
      >
        <form onSubmit={handleReportSubmit} className="space-y-4">
          <select
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
          >
            <option value="Spam or misleading">Spam or misleading</option>
            <option value="Harassment or hate speech">Harassment or hate speech</option>
            <option value="Cheating or match manipulation">Cheating or match manipulation</option>
            <option value="Inappropriate media">Inappropriate media</option>
          </select>
          <textarea
            rows={3}
            maxLength={600}
            value={reportDetails}
            onChange={(e) => setReportDetails(e.target.value)}
            placeholder="Optional context for moderators..."
            className="w-full p-3 rounded-xl inset-surface text-sm text-slate-900 dark:text-white focus:outline-none focus:border-[#00A86B] dark:focus:border-[#00D68F]"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm"
          >
            {t('submitReport')}
          </button>
        </form>
      </ModalDialog>
    </motion.article>
  );
}
