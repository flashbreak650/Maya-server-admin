import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { realtimeSocket } from '../lib/websocket';
import type {
  AppNotification,
  ChatMessage,
  CommunityGroup,
  Conversation,
  GroupMember,
  PlatformSettings,
  Post,
  PostComment,
  ReactionType,
  ReportRecord,
  Story,
  Tournament,
  TournamentMatchResult,
  TournamentParticipant,
  UserPrivateInfo,
  UserPublicProfile,
} from '../types';

function makeId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${rand}` : rand;
}

function getTimeMs(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return Date.parse(val) || 0;
  return 0;
}

// --- User Profiles & Private Info ---

const inFlightProfileCreations = new Map<string, Promise<UserPublicProfile>>();

export function ensureUserProfileExists(params: {
  uid: string;
  email: string;
  fullName: string;
  username?: string;
  phoneNumber?: string;
  carromPlayerId?: string;
  avatarUrl?: string;
  rememberMe?: boolean;
}): Promise<UserPublicProfile> {
  const existingPromise = inFlightProfileCreations.get(params.uid);
  if (existingPromise) return existingPromise;

  const promise = runEnsureUserProfileExists(params).finally(() => {
    inFlightProfileCreations.delete(params.uid);
  });
  inFlightProfileCreations.set(params.uid, promise);
  return promise;
}

async function runEnsureUserProfileExists(params: {
  uid: string;
  email: string;
  fullName: string;
  username?: string;
  phoneNumber?: string;
  carromPlayerId?: string;
  avatarUrl?: string;
  rememberMe?: boolean;
}): Promise<UserPublicProfile> {
  const userRef = doc(db, 'users', params.uid);
  const privateRef = doc(db, 'users', params.uid, 'private', 'info');
  const cleanPhone = params.phoneNumber?.trim().slice(0, 30) || '';

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existingData = snap.data() as UserPublicProfile;
      await updateDoc(userRef, {
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
      const privSnap = await getDoc(privateRef).catch(() => null);
      if (privSnap && !privSnap.exists()) {
        await setDoc(privateRef, {
          uid: params.uid,
          email: params.email.toLowerCase().slice(0, 160),
          ...(cleanPhone ? { phoneNumber: cleanPhone } : {}),
          rememberMe: Boolean(params.rememberMe),
          blockedUserIds: [],
          notificationsEnabled: true,
          showOnlineStatus: true,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      } else if (privSnap?.exists() && cleanPhone && !privSnap.data()?.phoneNumber) {
        await updateDoc(privateRef, {
          phoneNumber: cleanPhone,
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
      return existingData;
    }

    const baseHandle = (params.username || params.email.split('@')[0] || 'player')
      .replace(/[^a-zA-Z0-9_.]/g, '')
      .slice(0, 24);
    const finalUsername =
      baseHandle.length >= 3 ? baseHandle : `player_${params.uid.slice(0, 6)}`;

    const profilePayload: Record<string, unknown> = {
      uid: params.uid,
      fullName: params.fullName.trim().slice(0, 80) || 'Carrom Player',
      username: finalUsername,
      usernameLower: finalUsername.toLowerCase(),
      bio: 'Carrom Pool enthusiast on Carrom Hub.',
      isVerified: false,
      isSuspended: false,
      isBanned: false,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      tournamentsWon: 0,
      privacy: 'public',
      badges: ['New Challenger'],
      lastSeenAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.carromPlayerId?.trim()) {
      profilePayload.carromPlayerId = params.carromPlayerId.trim().slice(0, 40);
    }
    if (params.avatarUrl) {
      profilePayload.avatarUrl = params.avatarUrl;
    }

    const privatePayload: Record<string, unknown> = {
      uid: params.uid,
      email: params.email.toLowerCase().slice(0, 160),
      rememberMe: Boolean(params.rememberMe),
      blockedUserIds: [],
      notificationsEnabled: true,
      showOnlineStatus: true,
      updatedAt: serverTimestamp(),
    };
    if (cleanPhone) {
      privatePayload.phoneNumber = cleanPhone;
    }

    const batch = writeBatch(db);
    batch.set(userRef, profilePayload);
    batch.set(privateRef, privatePayload);
    await batch.commit();

    return {
      ...(profilePayload as unknown as UserPublicProfile),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  } catch (error) {
    // If another session/tab created the doc concurrently, return the existing profile
    const retrySnap = await getDoc(userRef).catch(() => null);
    if (retrySnap?.exists()) {
      return retrySnap.data() as UserPublicProfile;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<
    Pick<
      UserPublicProfile,
      | 'fullName'
      | 'username'
      | 'carromPlayerId'
      | 'bio'
      | 'facebookUrl'
      | 'tiktokUrl'
      | 'instagramUrl'
      | 'avatarUrl'
      | 'coverUrl'
      | 'privacy'
    >
  >
) {
  const userRef = doc(db, 'users', uid);
  try {
    const clean: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.fullName !== undefined) clean.fullName = updates.fullName.trim().slice(0, 80);
    if (updates.username !== undefined) {
      const cleaned = updates.username.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 32);
      if (cleaned.length >= 3) {
        clean.username = cleaned;
        clean.usernameLower = cleaned.toLowerCase();
      }
    }
    if (updates.carromPlayerId !== undefined) {
      clean.carromPlayerId = updates.carromPlayerId.trim().slice(0, 40);
    }
    if (updates.bio !== undefined) clean.bio = updates.bio.trim().slice(0, 300);
    if (updates.facebookUrl !== undefined) clean.facebookUrl = updates.facebookUrl.trim().slice(0, 200);
    if (updates.tiktokUrl !== undefined) clean.tiktokUrl = updates.tiktokUrl.trim().slice(0, 200);
    if (updates.instagramUrl !== undefined) clean.instagramUrl = updates.instagramUrl.trim().slice(0, 200);
    if (updates.avatarUrl !== undefined) clean.avatarUrl = updates.avatarUrl;
    if (updates.coverUrl !== undefined) clean.coverUrl = updates.coverUrl;
    if (updates.privacy !== undefined) clean.privacy = updates.privacy;

    await updateDoc(userRef, clean);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateUserPrivateSettings(
  uid: string,
  updates: Partial<
    Pick<UserPrivateInfo, 'phoneNumber' | 'blockedUserIds' | 'notificationsEnabled' | 'showOnlineStatus'>
  >
) {
  const ref = doc(db, 'users', uid, 'private', 'info');
  try {
    await updateDoc(ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/private/info`);
  }
}

export function subscribeToUsers(onData: (users: UserPublicProfile[]) => void): Unsubscribe {
  const q = query(collection(db, 'users'), where('isBanned', '==', false), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as UserPublicProfile);
      list.sort((a, b) => (b.followersCount || 0) - (a.followersCount || 0));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'users')
  );
}

export function subscribeToPrivateInfo(
  uid: string,
  onData: (info: UserPrivateInfo | null) => void
): Unsubscribe {
  const ref = doc(db, 'users', uid, 'private', 'info');
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserPrivateInfo) : null);
    },
    (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}/private/info`)
  );
}

// --- Follow / Unfollow ---

export function subscribeToFollowingIds(uid: string, onData: (ids: string[]) => void): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'following'), where('actorId', '==', uid), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.id));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/following`)
  );
}

export async function toggleFollowUser(
  currentUser: UserPublicProfile,
  targetUser: UserPublicProfile,
  currentlyFollowing: boolean
) {
  const followerDoc = doc(db, 'users', targetUser.uid, 'followers', currentUser.uid);
  const followingDoc = doc(db, 'users', currentUser.uid, 'following', targetUser.uid);
  const targetProfileRef = doc(db, 'users', targetUser.uid);
  const myProfileRef = doc(db, 'users', currentUser.uid);

  try {
    const batch = writeBatch(db);
    if (currentlyFollowing) {
      batch.delete(followerDoc);
      batch.delete(followingDoc);
      batch.update(targetProfileRef, {
        followersCount: Math.max(0, (targetUser.followersCount || 0) - 1),
        updatedAt: serverTimestamp(),
      });
      batch.update(myProfileRef, {
        followingCount: Math.max(0, (currentUser.followingCount || 0) - 1),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(followerDoc, {
        actorId: currentUser.uid,
        targetId: targetUser.uid,
        createdAt: serverTimestamp(),
      });
      batch.set(followingDoc, {
        actorId: currentUser.uid,
        targetId: targetUser.uid,
        createdAt: serverTimestamp(),
      });
      batch.update(targetProfileRef, {
        followersCount: (targetUser.followersCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      batch.update(myProfileRef, {
        followingCount: (currentUser.followingCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();

    if (!currentlyFollowing) {
      await createNotification({
        recipientId: targetUser.uid,
        actor: currentUser,
        type: 'follow',
        title: 'New Follower',
        body: `${currentUser.fullName} started following you on Carrom Hub.`,
        linkTab: 'profile',
        targetId: currentUser.uid,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${targetUser.uid}/followers`);
  }
}

// --- Stories ---

export function subscribeToActiveStories(onData: (stories: Story[]) => void): Unsubscribe {
  const q = query(collection(db, 'stories'), where('expiresAtMs', '>', 0), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const list = snap.docs
        .map((d) => d.data() as Story)
        .filter((s) => s.expiresAtMs > now);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'stories')
  );
}

export async function createStory(
  author: UserPublicProfile,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  caption?: string
) {
  const id = makeId('story');
  const ref = doc(db, 'stories', id);
  try {
    const payload: Record<string, unknown> = {
      id,
      authorId: author.uid,
      authorName: author.fullName,
      authorUsername: author.username,
      mediaUrl,
      mediaType,
      expiresAtMs: Date.now() + 24 * 60 * 60 * 1000,
      createdAt: serverTimestamp(),
    };
    if (author.avatarUrl) payload.authorAvatar = author.avatarUrl;
    if (caption?.trim()) payload.caption = caption.trim().slice(0, 200);
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `stories/${id}`);
  }
}

export async function deleteStory(storyId: string) {
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `stories/${storyId}`);
  }
}

// --- Posts, Reactions & Comments ---

export function subscribeToPosts(onData: (posts: Post[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'posts'),
    where('audience', 'in', ['public', 'friends', 'group']),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Post);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'posts')
  );
}

export async function createPost(params: {
  author: UserPublicProfile;
  caption: string;
  mediaUrl?: string;
  mediaType: 'none' | 'image' | 'video';
  audience: 'public' | 'friends' | 'group';
  groupId?: string;
  groupName?: string;
}) {
  const id = makeId('post');
  const postRef = doc(db, 'posts', id);
  const userRef = doc(db, 'users', params.author.uid);
  try {
    const payload: Record<string, unknown> = {
      id,
      authorId: params.author.uid,
      authorName: params.author.fullName,
      authorUsername: params.author.username,
      authorVerified: Boolean(params.author.isVerified),
      caption: params.caption.trim().slice(0, 2000),
      mediaType: params.mediaType,
      audience: params.audience,
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      reactionSummary: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.author.avatarUrl) payload.authorAvatar = params.author.avatarUrl;
    if (params.mediaUrl) payload.mediaUrl = params.mediaUrl;
    if (params.groupId) payload.groupId = params.groupId;
    if (params.groupName) payload.groupName = params.groupName.slice(0, 80);

    const batch = writeBatch(db);
    batch.set(postRef, payload);
    batch.update(userRef, {
      postsCount: (params.author.postsCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${id}`);
  }
}

export async function editPost(
  postId: string,
  updates: { caption: string; audience: 'public' | 'friends' | 'group' }
) {
  try {
    await updateDoc(doc(db, 'posts', postId), {
      caption: updates.caption.trim().slice(0, 2000),
      audience: updates.audience,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function deletePost(post: Post, currentUid: string) {
  try {
    await deleteDoc(doc(db, 'posts', post.id));
    if (post.authorId === currentUid) {
      const userSnap = await getDoc(doc(db, 'users', currentUid));
      if (userSnap.exists()) {
        const currentCount = (userSnap.data() as UserPublicProfile).postsCount || 0;
        await updateDoc(doc(db, 'users', currentUid), {
          postsCount: Math.max(0, currentCount - 1),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
  }
}

export function subscribeToPostReactions(
  postId: string,
  onData: (reactions: Record<string, ReactionType>) => void
): Unsubscribe {
  const q = query(collection(db, 'posts', postId, 'reactions'), where('userId', '!=', ''), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const map: Record<string, ReactionType> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as { userId: string; type: ReactionType };
        map[data.userId] = data.type;
      });
      onData(map);
    },
    () => undefined
  );
}

export async function togglePostReaction(
  post: Post,
  actor: UserPublicProfile,
  reactionType: ReactionType,
  currentReactions: Record<string, ReactionType>
) {
  const reactionRef = doc(db, 'posts', post.id, 'reactions', actor.uid);
  const postRef = doc(db, 'posts', post.id);
  const existingType = currentReactions[actor.uid];

  try {
    const summary: Record<string, number> = { ...(post.reactionSummary || {}) };
    let likesCount = post.likesCount || 0;

    if (existingType === reactionType) {
      await deleteDoc(reactionRef);
      summary[reactionType] = Math.max(0, (summary[reactionType] || 1) - 1);
      likesCount = Math.max(0, likesCount - 1);
    } else {
      await setDoc(reactionRef, {
        userId: actor.uid,
        type: reactionType,
        createdAt: serverTimestamp(),
      });
      if (existingType) {
        summary[existingType] = Math.max(0, (summary[existingType] || 1) - 1);
      } else {
        likesCount += 1;
      }
      summary[reactionType] = (summary[reactionType] || 0) + 1;

      if (post.authorId !== actor.uid && !existingType) {
        await createNotification({
          recipientId: post.authorId,
          actor,
          type: 'like',
          title: 'New Reaction',
          body: `${actor.fullName} reacted (${reactionType}) to your post.`,
          linkTab: 'feed',
          targetId: post.id,
        });
      }
    }

    await updateDoc(postRef, {
      likesCount,
      reactionSummary: summary,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/reactions`);
  }
}

export function subscribeToComments(
  postId: string,
  onData: (comments: PostComment[]) => void
): Unsubscribe {
  const q = query(collection(db, 'posts', postId, 'comments'), where('postId', '==', postId), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PostComment);
      list.sort((a, b) => getTimeMs(a.createdAt) - getTimeMs(b.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `posts/${postId}/comments`)
  );
}

export async function addComment(post: Post, author: UserPublicProfile, text: string) {
  const commentId = makeId('cmt');
  const commentRef = doc(db, 'posts', post.id, 'comments', commentId);
  const postRef = doc(db, 'posts', post.id);
  try {
    const payload: Record<string, unknown> = {
      id: commentId,
      postId: post.id,
      authorId: author.uid,
      authorName: author.fullName,
      authorUsername: author.username,
      text: text.trim().slice(0, 800),
      createdAt: serverTimestamp(),
    };
    if (author.avatarUrl) payload.authorAvatar = author.avatarUrl;

    const batch = writeBatch(db);
    batch.set(commentRef, payload);
    batch.update(postRef, {
      commentsCount: (post.commentsCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    if (post.authorId !== author.uid) {
      await createNotification({
        recipientId: post.authorId,
        actor: author,
        type: 'comment',
        title: 'New Comment',
        body: `${author.fullName} commented: "${text.trim().slice(0, 80)}"`,
        linkTab: 'feed',
        targetId: post.id,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${post.id}/comments/${commentId}`);
  }
}

export async function incrementShareCount(post: Post) {
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      sharesCount: (post.sharesCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${post.id}`);
  }
}

// --- Reports ---

export async function submitReport(params: {
  reporterId: string;
  targetType: 'post' | 'user' | 'group';
  targetId: string;
  reason: string;
  details?: string;
}) {
  const id = makeId('rep');
  try {
    const payload: Record<string, unknown> = {
      id,
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      reason: params.reason.trim().slice(0, 120),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.details?.trim()) payload.details = params.details.trim().slice(0, 600);
    await setDoc(doc(db, 'reports', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${id}`);
  }
}

// --- Community Groups ---

export function subscribeToGroups(onData: (groups: CommunityGroup[]) => void): Unsubscribe {
  const q = query(collection(db, 'groups'), where('privacy', 'in', ['public', 'private']), limit(60));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as CommunityGroup);
      list.sort((a, b) => (b.membersCount || 0) - (a.membersCount || 0));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'groups')
  );
}

export function subscribeToGroupMembers(
  groupId: string,
  onData: (members: GroupMember[]) => void
): Unsubscribe {
  const q = query(collection(db, 'groups', groupId, 'members'), where('userId', '!=', ''), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as GroupMember));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `groups/${groupId}/members`)
  );
}

export async function createCommunityGroup(params: {
  admin: UserPublicProfile;
  name: string;
  description: string;
  privacy: 'public' | 'private';
  logoUrl?: string;
  coverUrl?: string;
}): Promise<CommunityGroup> {
  const groupId = makeId('grp');
  const convId = makeId('conv');
  const groupRef = doc(db, 'groups', groupId);
  const memberRef = doc(db, 'groups', groupId, 'members', params.admin.uid);
  const convRef = doc(db, 'conversations', convId);

  try {
    const groupPayload: Record<string, unknown> = {
      id: groupId,
      name: params.name.trim().slice(0, 80),
      description: params.description.trim().slice(0, 600),
      privacy: params.privacy,
      adminId: params.admin.uid,
      conversationId: convId,
      membersCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.logoUrl) groupPayload.logoUrl = params.logoUrl;
    if (params.coverUrl) groupPayload.coverUrl = params.coverUrl;

    const memberPayload: Record<string, unknown> = {
      userId: params.admin.uid,
      role: 'admin',
      fullName: params.admin.fullName,
      username: params.admin.username,
      joinedAt: serverTimestamp(),
    };
    if (params.admin.avatarUrl) memberPayload.avatarUrl = params.admin.avatarUrl;

    const convPayload: Record<string, unknown> = {
      id: convId,
      type: 'group',
      name: params.name.trim().slice(0, 80),
      adminId: params.admin.uid,
      groupId,
      participantIds: [params.admin.uid],
      participantProfiles: {
        [params.admin.uid]: {
          fullName: params.admin.fullName,
          username: params.admin.username,
          ...(params.admin.avatarUrl ? { avatarUrl: params.admin.avatarUrl } : {}),
        },
      },
      lastMessageText: 'Community group chat created',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.logoUrl) convPayload.avatarUrl = params.logoUrl;

    const batch = writeBatch(db);
    batch.set(groupRef, groupPayload);
    batch.set(memberRef, memberPayload);
    batch.set(convRef, convPayload);
    await batch.commit();

    return groupPayload as unknown as CommunityGroup;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `groups/${groupId}`);
  }
}

export async function joinCommunityGroup(group: CommunityGroup, user: UserPublicProfile) {
  const memberRef = doc(db, 'groups', group.id, 'members', user.uid);
  const groupRef = doc(db, 'groups', group.id);
  const convRef = doc(db, 'conversations', group.conversationId);

  try {
    const convSnap = await getDoc(convRef);
    const batch = writeBatch(db);
    batch.set(memberRef, {
      userId: user.uid,
      role: 'member',
      fullName: user.fullName,
      username: user.username,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      joinedAt: serverTimestamp(),
    });
    batch.update(groupRef, {
      membersCount: (group.membersCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });

    if (convSnap.exists()) {
      const conv = convSnap.data() as Conversation;
      if (!conv.participantIds.includes(user.uid) && conv.participantIds.length < 50) {
        batch.update(convRef, {
          participantIds: [...conv.participantIds, user.uid],
          participantProfiles: {
            ...(conv.participantProfiles || {}),
            [user.uid]: {
              fullName: user.fullName,
              username: user.username,
              ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
            },
          },
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `groups/${group.id}/members/${user.uid}`);
  }
}

export async function leaveOrRemoveGroupMember(
  group: CommunityGroup,
  targetUserId: string
) {
  const memberRef = doc(db, 'groups', group.id, 'members', targetUserId);
  const groupRef = doc(db, 'groups', group.id);
  const convRef = doc(db, 'conversations', group.conversationId);

  try {
    const convSnap = await getDoc(convRef);
    const batch = writeBatch(db);
    batch.delete(memberRef);
    batch.update(groupRef, {
      membersCount: Math.max(0, (group.membersCount || 1) - 1),
      updatedAt: serverTimestamp(),
    });
    if (convSnap.exists()) {
      const conv = convSnap.data() as Conversation;
      const nextIds = conv.participantIds.filter((id) => id !== targetUserId);
      if (nextIds.length > 0) {
        const nextProfiles = { ...(conv.participantProfiles || {}) };
        delete nextProfiles[targetUserId];
        batch.update(convRef, {
          participantIds: nextIds,
          participantProfiles: nextProfiles,
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${group.id}/members/${targetUserId}`);
  }
}

// --- Real-Time Chat System ---

export function subscribeToConversations(
  uid: string,
  onData: (conversations: Conversation[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', uid),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Conversation);
      list.sort((a, b) => getTimeMs(b.updatedAt) - getTimeMs(a.updatedAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
  );
}

export async function getOrCreatePrivateConversation(
  currentUser: UserPublicProfile,
  otherUser: UserPublicProfile
): Promise<Conversation> {
  const pair = [currentUser.uid, otherUser.uid].sort();
  const convId = `dm_${pair[0]}_${pair[1]}`;
  const convRef = doc(db, 'conversations', convId);

  try {
    const snap = await getDoc(convRef);
    if (snap.exists()) {
      return snap.data() as Conversation;
    }

    const payload: Record<string, unknown> = {
      id: convId,
      type: 'private',
      adminId: currentUser.uid,
      participantIds: pair,
      participantProfiles: {
        [currentUser.uid]: {
          fullName: currentUser.fullName,
          username: currentUser.username,
          ...(currentUser.avatarUrl ? { avatarUrl: currentUser.avatarUrl } : {}),
        },
        [otherUser.uid]: {
          fullName: otherUser.fullName,
          username: otherUser.username,
          ...(otherUser.avatarUrl ? { avatarUrl: otherUser.avatarUrl } : {}),
        },
      },
      lastMessageText: 'Started a new conversation',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(convRef, payload);
    return payload as unknown as Conversation;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `conversations/${convId}`);
  }
}

export async function createGroupConversation(params: {
  admin: UserPublicProfile;
  name: string;
  members: UserPublicProfile[];
}): Promise<Conversation> {
  const convId = makeId('gchat');
  const convRef = doc(db, 'conversations', convId);

  const uniqueUsers = new Map<string, UserPublicProfile>();
  uniqueUsers.set(params.admin.uid, params.admin);
  for (const m of params.members) {
    uniqueUsers.set(m.uid, m);
  }
  const participantIds = Array.from(uniqueUsers.keys()).slice(0, 50);
  const participantProfiles: Record<string, Record<string, string>> = {};
  for (const [id, u] of uniqueUsers.entries()) {
    participantProfiles[id] = {
      fullName: u.fullName,
      username: u.username,
      ...(u.avatarUrl ? { avatarUrl: u.avatarUrl } : {}),
    };
  }

  try {
    const payload = {
      id: convId,
      type: 'group',
      name: params.name.trim().slice(0, 80),
      adminId: params.admin.uid,
      participantIds,
      participantProfiles,
      lastMessageText: `${params.admin.fullName} created the group`,
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(convRef, payload);
    return payload as unknown as Conversation;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${convId}`);
  }
}

export function subscribeToMessages(
  conversationId: string,
  uid: string,
  onData: (messages: ChatMessage[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    where('participantIds', 'array-contains', uid),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as ChatMessage);
      list.sort((a, b) => getTimeMs(a.createdAt) - getTimeMs(b.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `conversations/${conversationId}/messages`)
  );
}

export async function sendChatMessage(params: {
  conversation: Conversation;
  sender: UserPublicProfile;
  text: string;
  mediaUrl?: string;
  mediaType: 'text' | 'image' | 'video' | 'voice';
  replyTo?: ChatMessage | null;
}) {
  const msgId = makeId('msg');
  const msgRef = doc(db, 'conversations', params.conversation.id, 'messages', msgId);
  const convRef = doc(db, 'conversations', params.conversation.id);

  try {
    const payload: Record<string, unknown> = {
      id: msgId,
      conversationId: params.conversation.id,
      senderId: params.sender.uid,
      senderName: params.sender.fullName,
      text: params.text.trim().slice(0, 2000),
      mediaType: params.mediaType,
      reactions: {},
      readBy: [params.sender.uid],
      participantIds: params.conversation.participantIds,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.sender.avatarUrl) payload.senderAvatar = params.sender.avatarUrl;
    if (params.mediaUrl) payload.mediaUrl = params.mediaUrl;
    if (params.replyTo) {
      payload.replyToId = params.replyTo.id;
      payload.replyToText = (params.replyTo.text || params.replyTo.mediaType).slice(0, 200);
      payload.replyToSender = params.replyTo.senderName.slice(0, 80);
    }

    const previewText =
      params.mediaType === 'text'
        ? params.text.trim().slice(0, 120)
        : params.mediaType === 'voice'
          ? 'Voice message'
          : params.mediaType === 'video'
            ? 'Video clip'
            : 'Photo';

    const batch = writeBatch(db);
    batch.set(msgRef, payload);
    batch.update(convRef, {
      lastMessageText: previewText,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();

    // Notify other participants
    const others = params.conversation.participantIds.filter((id) => id !== params.sender.uid);
    for (const recipientId of others.slice(0, 8)) {
      await createNotification({
        recipientId,
        actor: params.sender,
        type: 'message',
        title: params.conversation.type === 'group' ? params.conversation.name || 'Group Chat' : params.sender.fullName,
        body: previewText,
        linkTab: 'chat',
        targetId: params.conversation.id,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `conversations/${params.conversation.id}/messages/${msgId}`);
  }
}

export async function markMessagesRead(conversationId: string, messages: ChatMessage[], uid: string) {
  const unread = messages.filter((m) => m.senderId !== uid && !m.readBy.includes(uid));
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const m of unread.slice(0, 20)) {
      batch.update(doc(db, 'conversations', conversationId, 'messages', m.id), {
        readBy: [...m.readBy, uid].slice(0, 50),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch {
    // Non-critical read receipt error
  }
}

export async function reactToMessage(
  conversationId: string,
  message: ChatMessage,
  uid: string,
  emoji: string
) {
  const next = { ...(message.reactions || {}) };
  if (next[uid] === emoji) {
    delete next[uid];
  } else {
    next[uid] = emoji;
  }
  try {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', message.id), {
      reactions: next,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversationId}/messages/${message.id}`);
  }
}

export async function deleteOwnMessage(conversationId: string, messageId: string) {
  try {
    await updateDoc(doc(db, 'conversations', conversationId, 'messages', messageId), {
      deleted: true,
      text: 'This message was deleted',
      mediaUrl: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversationId}/messages/${messageId}`);
  }
}

export async function updateGroupChatParticipants(
  conversation: Conversation,
  nextParticipantIds: string[],
  nextProfiles: Record<string, { fullName: string; username: string; avatarUrl?: string }>
) {
  try {
    await updateDoc(doc(db, 'conversations', conversation.id), {
      participantIds: nextParticipantIds,
      participantProfiles: nextProfiles,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `conversations/${conversation.id}`);
  }
}

// --- Tournaments & Verification ---

export function subscribeToTournaments(onData: (list: Tournament[]) => void): Unsubscribe {
  const q = query(
    collection(db, 'tournaments'),
    where('status', 'in', ['upcoming', 'ongoing', 'pending_verification', 'completed']),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as Tournament);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'tournaments')
  );
}

export async function createTournament(params: {
  creator: UserPublicProfile;
  name: string;
  description: string;
  entryInfo: string;
  rules: string;
  maxPlayers: number;
  coverUrl?: string;
}) {
  const id = makeId('tour');
  try {
    const payload: Record<string, unknown> = {
      id,
      name: params.name.trim().slice(0, 100),
      description: params.description.trim().slice(0, 800),
      entryInfo: params.entryInfo.trim().slice(0, 200),
      rules: params.rules.trim().slice(0, 1500),
      creatorId: params.creator.uid,
      status: 'upcoming',
      maxPlayers: Math.min(256, Math.max(2, Math.round(params.maxPlayers))),
      participantsCount: 0,
      winnerVerified: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (params.coverUrl) payload.coverUrl = params.coverUrl;
    await setDoc(doc(db, 'tournaments', id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tournaments/${id}`);
  }
}

export function subscribeToTournamentParticipants(
  tournamentId: string,
  onData: (participants: TournamentParticipant[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'participants'),
    where('userId', '!=', ''),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TournamentParticipant);
      list.sort((a, b) => (b.points || 0) - (a.points || 0));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `tournaments/${tournamentId}/participants`)
  );
}

export async function joinTournament(tournament: Tournament, user: UserPublicProfile) {
  const pRef = doc(db, 'tournaments', tournament.id, 'participants', user.uid);
  const tRef = doc(db, 'tournaments', tournament.id);
  try {
    const batch = writeBatch(db);
    batch.set(pRef, {
      userId: user.uid,
      fullName: user.fullName,
      username: user.username,
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.carromPlayerId ? { carromPlayerId: user.carromPlayerId } : {}),
      wins: 0,
      points: 0,
      joinedAt: serverTimestamp(),
    });
    batch.update(tRef, {
      participantsCount: (tournament.participantsCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tournaments/${tournament.id}/participants`);
  }
}

export function subscribeToTournamentMatches(
  tournamentId: string,
  onData: (matches: TournamentMatchResult[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'matches'),
    where('tournamentId', '==', tournamentId),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as TournamentMatchResult);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `tournaments/${tournamentId}/matches`)
  );
}

export async function submitTournamentMatchResult(params: {
  tournamentId: string;
  submitter: UserPublicProfile;
  opponentName: string;
  claimedWinnerId: string;
  claimedWinnerName: string;
  scoreSummary: string;
}) {
  const matchId = makeId('match');
  try {
    await setDoc(doc(db, 'tournaments', params.tournamentId, 'matches', matchId), {
      id: matchId,
      tournamentId: params.tournamentId,
      submittedBy: params.submitter.uid,
      opponentName: params.opponentName.trim().slice(0, 80),
      claimedWinnerId: params.claimedWinnerId,
      claimedWinnerName: params.claimedWinnerName.trim().slice(0, 80),
      scoreSummary: params.scoreSummary.trim().slice(0, 120),
      verificationStatus: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tournaments/${params.tournamentId}/matches/${matchId}`);
  }
}

// --- Notifications ---

export function subscribeToNotifications(
  uid: string,
  onData: (items: AppNotification[]) => void
): Unsubscribe {
  const q = query(collection(db, 'notifications'), where('recipientId', '==', uid), limit(50));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as AppNotification);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
  );
}

export async function createNotification(params: {
  recipientId: string;
  actor: UserPublicProfile;
  type: AppNotification['type'];
  title: string;
  body: string;
  linkTab?: string;
  targetId?: string;
}) {
  if (params.recipientId === params.actor.uid) return;
  const id = makeId('notif');
  try {
    const payload: Record<string, unknown> = {
      id,
      recipientId: params.recipientId,
      actorId: params.actor.uid,
      actorName: params.actor.fullName,
      type: params.type,
      title: params.title.slice(0, 120),
      body: params.body.slice(0, 300),
      read: false,
      createdAt: serverTimestamp(),
    };
    if (params.actor.avatarUrl) payload.actorAvatar = params.actor.avatarUrl;
    if (params.linkTab) payload.linkTab = params.linkTab;
    if (params.targetId) payload.targetId = params.targetId;
    await setDoc(doc(db, 'notifications', id), payload);
    realtimeSocket.pushLiveNotification([params.recipientId], {
      ...payload,
      createdAt: Date.now(),
    });
  } catch {
    // Do not block primary user workflow if notification fails
  }
}

export async function markNotificationRead(notificationId: string) {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(items: AppNotification[]) {
  const unread = items.filter((n) => !n.read);
  if (unread.length === 0) return;
  try {
    const batch = writeBatch(db);
    for (const item of unread.slice(0, 30)) {
      batch.update(doc(db, 'notifications', item.id), { read: true });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

// --- Platform Settings & Admin Actions ---

export function subscribeToPlatformSettings(
  onData: (settings: PlatformSettings | null) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, 'platform_settings', 'global'),
    (snap) => {
      onData(snap.exists() ? (snap.data() as PlatformSettings) : null);
    },
    () => onData(null)
  );
}

async function logAdminActionOnServer(
  action: string,
  targetType: string,
  targetId: string,
  details: string
) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return;
  await fetch('/api/admin/audit-log', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, targetType, targetId, details }),
  }).catch(() => undefined);
}

export async function adminUpdateUserModeration(
  targetUser: UserPublicProfile,
  updates: Partial<Pick<UserPublicProfile, 'isVerified' | 'isSuspended' | 'isBanned'>>
) {
  try {
    await updateDoc(doc(db, 'users', targetUser.uid), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    await logAdminActionOnServer(
      'USER_MODERATION',
      'user',
      targetUser.uid,
      `${targetUser.username}: ${JSON.stringify(updates)}`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUser.uid}`);
  }
}

export async function adminDeletePost(post: Post) {
  try {
    await deleteDoc(doc(db, 'posts', post.id));
    await logAdminActionOnServer('DELETE_POST', 'post', post.id, `Author: ${post.authorUsername}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}`);
  }
}

export async function adminDeleteGroup(group: CommunityGroup) {
  try {
    await deleteDoc(doc(db, 'groups', group.id));
    await logAdminActionOnServer('DELETE_GROUP', 'group', group.id, `Group: ${group.name}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `groups/${group.id}`);
  }
}

export function subscribeToReports(onData: (reports: ReportRecord[]) => void): Unsubscribe {
  const q = query(collection(db, 'reports'), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as ReportRecord);
      list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'reports')
  );
}

export async function adminResolveReport(
  reportId: string,
  status: 'reviewed' | 'dismissed' | 'action_taken'
) {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      updatedAt: serverTimestamp(),
    });
    await logAdminActionOnServer('RESOLVE_REPORT', 'report', reportId, `Status: ${status}`);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}

export async function adminVerifyMatchAndCrownWinner(params: {
  tournament: Tournament;
  match: TournamentMatchResult;
  adminUid: string;
  approve: boolean;
  crownTournamentWinner?: boolean;
}) {
  try {
    const matchRef = doc(db, 'tournaments', params.tournament.id, 'matches', params.match.id);
    const batch = writeBatch(db);
    batch.update(matchRef, {
      verificationStatus: params.approve ? 'verified' : 'rejected',
      verifiedBy: params.adminUid,
      updatedAt: serverTimestamp(),
    });

    if (params.approve) {
      const participantRef = doc(
        db,
        'tournaments',
        params.tournament.id,
        'participants',
        params.match.claimedWinnerId
      );
      const pSnap = await getDoc(participantRef);
      if (pSnap.exists()) {
        const pData = pSnap.data() as TournamentParticipant;
        batch.update(participantRef, {
          wins: (pData.wins || 0) + 1,
          points: (pData.points || 0) + 100,
        });
      }

      if (params.crownTournamentWinner) {
        batch.update(doc(db, 'tournaments', params.tournament.id), {
          status: 'completed',
          winnerId: params.match.claimedWinnerId,
          winnerName: params.match.claimedWinnerName,
          winnerVerified: true,
          updatedAt: serverTimestamp(),
        });

        const winnerUserRef = doc(db, 'users', params.match.claimedWinnerId);
        const wSnap = await getDoc(winnerUserRef);
        if (wSnap.exists()) {
          const wData = wSnap.data() as UserPublicProfile;
          const nextBadges = Array.from(
            new Set([...(wData.badges || []), 'Tournament Champion'])
          ).slice(0, 10);
          batch.update(winnerUserRef, {
            tournamentsWon: (wData.tournamentsWon || 0) + 1,
            badges: nextBadges,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

    await batch.commit();
    await logAdminActionOnServer(
      params.crownTournamentWinner ? 'VERIFY_AND_CROWN_WINNER' : 'VERIFY_MATCH_RESULT',
      'tournament',
      params.tournament.id,
      `Match ${params.match.id} (${params.approve ? 'verified' : 'rejected'})`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `tournaments/${params.tournament.id}`);
  }
}

export async function adminSavePlatformSettings(
  adminUid: string,
  settings: Omit<PlatformSettings, 'updatedAt' | 'updatedBy'>
) {
  try {
    await setDoc(doc(db, 'platform_settings', 'global'), {
      ...settings,
      updatedBy: adminUid,
      updatedAt: serverTimestamp(),
    });
    await logAdminActionOnServer(
      'UPDATE_PLATFORM_SETTINGS',
      'platform_settings',
      'global',
      JSON.stringify(settings)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'platform_settings/global');
  }
}

export async function fetchAllUsersForAdmin(): Promise<UserPublicProfile[]> {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('isBanned', 'in', [false, true]), limit(200)));
    return snap.docs.map((d) => d.data() as UserPublicProfile);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}
