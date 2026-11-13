export const FIELD_LIMITS = {
  FULL_NAME_MAX: 80,
  USERNAME_MIN: 3,
  USERNAME_MAX: 32,
  CARROM_ID_MAX: 40,
  BIO_MAX: 300,
  CAPTION_MAX: 2000,
  COMMENT_MAX: 800,
  STORY_CAPTION_MAX: 200,
  GROUP_NAME_MAX: 80,
  GROUP_DESC_MAX: 600,
  MESSAGE_MAX: 2000,
  TOURNAMENT_NAME_MAX: 100,
  TOURNAMENT_DESC_MAX: 800,
  TOURNAMENT_RULES_MAX: 1500,
} as const;

export const USERNAME_REGEX = /^[a-zA-Z0-9_.]+$/;

export type NavTab =
  | 'feed'
  | 'explore'
  | 'chat'
  | 'notifications'
  | 'profile'
  | 'admin';

export type ReactionType = 'like' | 'queen' | 'fire' | 'clap' | 'wow';

export interface UserPublicProfile {
  uid: string;
  fullName: string;
  username: string;
  usernameLower: string;
  carromPlayerId?: string;
  bio?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
  avatarUrl?: string;
  coverUrl?: string;
  isVerified: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  tournamentsWon: number;
  privacy: 'public' | 'friends';
  badges?: string[];
  lastSeenAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  phoneNumber?: string;
  rememberMe?: boolean;
  blockedUserIds: string[];
  notificationsEnabled: boolean;
  showOnlineStatus: boolean;
  updatedAt?: unknown;
}

export interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  expiresAtMs: number;
  createdAt?: unknown;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  authorVerified?: boolean;
  caption: string;
  mediaUrl?: string;
  mediaType: 'none' | 'image' | 'video';
  audience: 'public' | 'friends' | 'group';
  groupId?: string;
  groupName?: string;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  reactionSummary?: Record<string, number>;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername: string;
  authorAvatar?: string;
  text: string;
  createdAt?: unknown;
}

export interface CommunityGroup {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  coverUrl?: string;
  privacy: 'public' | 'private';
  adminId: string;
  conversationId: string;
  membersCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMember {
  userId: string;
  role: 'admin' | 'member';
  fullName: string;
  username: string;
  avatarUrl?: string;
  joinedAt?: unknown;
}

export interface ParticipantProfileStub {
  fullName: string;
  username: string;
  avatarUrl?: string;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  name?: string;
  avatarUrl?: string;
  adminId: string;
  groupId?: string;
  participantIds: string[];
  participantProfiles?: Record<string, ParticipantProfileStub>;
  lastMessageText?: string;
  lastMessageAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  mediaUrl?: string;
  mediaType: 'text' | 'image' | 'video' | 'voice';
  replyToId?: string;
  replyToText?: string;
  replyToSender?: string;
  reactions?: Record<string, string>;
  readBy: string[];
  participantIds: string[];
  deleted: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  entryInfo: string;
  rules: string;
  coverUrl?: string;
  creatorId: string;
  status: 'upcoming' | 'ongoing' | 'pending_verification' | 'completed';
  maxPlayers: number;
  participantsCount: number;
  winnerId?: string;
  winnerName?: string;
  winnerVerified: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentParticipant {
  userId: string;
  fullName: string;
  username: string;
  avatarUrl?: string;
  carromPlayerId?: string;
  wins: number;
  points: number;
  joinedAt?: unknown;
}

export interface TournamentMatchResult {
  id: string;
  tournamentId: string;
  submittedBy: string;
  opponentName: string;
  claimedWinnerId: string;
  claimedWinnerName: string;
  scoreSummary: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verifiedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorAvatar?: string;
  type: 'follow' | 'like' | 'comment' | 'message' | 'group_invite' | 'tournament' | 'mention';
  title: string;
  body: string;
  linkTab?: string;
  targetId?: string;
  read: boolean;
  createdAt?: unknown;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: 'post' | 'user' | 'group';
  targetId: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewed' | 'dismissed' | 'action_taken';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlatformSettings {
  maintenanceMode: boolean;
  allowRegistrations: boolean;
  allowTournamentCreation: boolean;
  announcementBanner: string;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface ToastItem {
  id: string;
  kind: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
