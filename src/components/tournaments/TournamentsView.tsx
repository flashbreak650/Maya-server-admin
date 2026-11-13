import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Crown,
  Loader2,
  Plus,
  ShieldAlert,
  Trophy,
  Users,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { CARROM_ASSETS } from '../../lib/assets';
import { usePreferences } from '../../lib/i18n';
import { compressImageToDataUrl } from '../../lib/media';
import {
  createTournament,
  joinTournament,
  submitTournamentMatchResult,
  subscribeToTournamentMatches,
  subscribeToTournamentParticipants,
} from '../../services/firestoreService';
import type {
  PlatformSettings,
  Tournament,
  TournamentMatchResult,
  TournamentParticipant,
  UserPublicProfile,
} from '../../types';
import { EmptyState, ModalDialog, PlayerAvatar } from '../ui/ToastAndDialogs';

interface TournamentsViewProps {
  currentUser: UserPublicProfile;
  users: UserPublicProfile[];
  tournaments: Tournament[];
  platformSettings: PlatformSettings | null;
  onOpenProfile: (uid: string) => void;
  onToast: (kind: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export function TournamentsView({
  currentUser,
  users,
  tournaments,
  platformSettings,
  onOpenProfile,
  onToast,
}: TournamentsViewProps) {
  const { t } = usePreferences();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<TournamentParticipant[]>([]);
  const [matches, setMatches] = useState<TournamentMatchResult[]>([]);

  // Create tournament modal
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entryInfo, setEntryInfo] = useState('Free Entry · Open Bracket');
  const [rules, setRules] = useState('Best of 3 boards · Standard Carrom Pool rules · Screenshot proof required.');
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [coverUrl, setCoverUrl] = useState('');
  const [creating, setCreating] = useState(false);

  // Submit match result modal
  const [submitMatchOpen, setSubmitMatchOpen] = useState(false);
  const [opponentName, setOpponentName] = useState('');
  const [claimedWinnerId, setClaimedWinnerId] = useState(currentUser.uid);
  const [scoreSummary, setScoreSummary] = useState('');
  const [submittingMatch, setSubmittingMatch] = useState(false);

  const selectedTournament = tournaments.find((tour) => tour.id === selectedId) || null;
  const allowCreation = platformSettings ? platformSettings.allowTournamentCreation : true;

  useEffect(() => {
    if (!selectedTournament) {
      setParticipants([]);
      setMatches([]);
      return;
    }
    const u1 = subscribeToTournamentParticipants(selectedTournament.id, setParticipants);
    const u2 = subscribeToTournamentMatches(selectedTournament.id, setMatches);
    return () => {
      u1();
      u2();
    };
  }, [selectedTournament?.id]);

  const isJoined = participants.some((p) => p.userId === currentUser.uid);

  const handleCoverUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file, 1200, 0.8);
      setCoverUrl(compressed);
    } catch {
      onToast('error', 'Cover upload failed');
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!allowCreation) {
      onToast('error', 'Tournament creation disabled', 'Administrators have paused new tournaments.');
      return;
    }
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      await createTournament({
        creator: currentUser,
        name,
        description,
        entryInfo,
        rules,
        maxPlayers,
        coverUrl: coverUrl || undefined,
      });
      setCreateOpen(false);
      setName('');
      setDescription('');
      setCoverUrl('');
      onToast('success', 'Tournament created');
    } catch {
      onToast('error', 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (tour: Tournament) => {
    if (tour.participantsCount >= tour.maxPlayers) {
      onToast('error', 'Tournament full');
      return;
    }
    try {
      await joinTournament(tour, currentUser);
      onToast('success', `Entered ${tour.name}`);
    } catch {
      onToast('error', 'Could not join tournament');
    }
  };

  const handleSubmitMatch = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedTournament || !opponentName.trim() || !scoreSummary.trim() || submittingMatch) return;
    setSubmittingMatch(true);
    const winnerObj =
      participants.find((p) => p.userId === claimedWinnerId) ||
      users.find((u) => u.uid === claimedWinnerId);

    try {
      await submitTournamentMatchResult({
        tournamentId: selectedTournament.id,
        submitter: currentUser,
        opponentName,
        claimedWinnerId,
        claimedWinnerName: winnerObj?.fullName || currentUser.fullName,
        scoreSummary,
      });
      setSubmitMatchOpen(false);
      setOpponentName('');
      setScoreSummary('');
      onToast(
        'info',
        'Result submitted for verification',
        'A verified admin must review the result before official points or winner status are awarded.'
      );
    } catch {
      onToast('error', 'Could not submit match result');
    } finally {
      setSubmittingMatch(false);
    }
  };

  if (selectedTournament) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedId(null)}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-[#A5B5AC] dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('backToTournaments')}
        </button>

        {/* Tournament Header */}
        <section className="card-surface rounded-3xl overflow-hidden">
          <div className="h-44 sm:h-52 relative bg-slate-200 dark:bg-[#080D0B]">
            <img
              src={selectedTournament.coverUrl || CARROM_ASSETS.tournamentTrophy}
              alt={selectedTournament.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#14221B] via-white/25 dark:via-[#14221B]/35 to-transparent" />
          </div>

          <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                  {selectedTournament.name}
                </h1>
                <p className="text-xs text-slate-600 dark:text-[#A5B5AC] mt-1">
                  {selectedTournament.entryInfo} ·{' '}
                  <span className="tabular-nums">
                    {selectedTournament.participantsCount}/{selectedTournament.maxPlayers} {t('players')}
                  </span>{' '}
                  · <span className="capitalize">{selectedTournament.status.replace('_', ' ')}</span>
                </p>
              </div>

              <div className="flex items-center gap-2.5 flex-wrap">
                {!isJoined && selectedTournament.status !== 'completed' && (
                  <button
                    onClick={() => void handleJoin(selectedTournament)}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs"
                  >
                    {t('joinTournament')}
                  </button>
                )}
                {isJoined && selectedTournament.status !== 'completed' && (
                  <button
                    onClick={() => {
                      setClaimedWinnerId(currentUser.uid);
                      setSubmitMatchOpen(true);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/15 text-slate-900 dark:text-white font-semibold text-xs transition-colors"
                  >
                    {t('submitMatchResult')}
                  </button>
                )}
              </div>
            </div>

            {selectedTournament.description && (
              <p className="text-sm text-slate-700 dark:text-[#D5E2DB] leading-relaxed">
                {selectedTournament.description}
              </p>
            )}

            {/* Verified Winner Banner ONLY when admin-verified */}
            {selectedTournament.winnerVerified && selectedTournament.winnerName ? (
              <div className="rounded-2xl bg-[#00A86B]/10 dark:bg-[#00D68F]/10 border border-[#00A86B]/30 dark:border-[#00D68F]/35 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Crown className="w-7 h-7 text-[#00A86B] dark:text-[#00D68F] shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-[#008F5B] dark:text-[#00D68F]">Verified Tournament Champion</p>
                    <p className="text-base font-display font-bold text-slate-900 dark:text-white">
                      {selectedTournament.winnerName}
                    </p>
                  </div>
                </div>
                {selectedTournament.winnerId && (
                  <button
                    onClick={() => onOpenProfile(selectedTournament.winnerId!)}
                    className="px-3.5 py-2 rounded-xl bg-[#00D68F] text-[#080D0B] font-semibold text-xs"
                  >
                    Winner Profile
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl inset-surface p-3.5 flex items-center gap-2.5 text-xs text-slate-600 dark:text-[#A5B5AC]">
                <ShieldAlert className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
                <span>
                  Tournament winners are never declared automatically. Match results must be verified by a platform administrator.
                </span>
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Rules & Match Submissions */}
          <div className="lg:col-span-7 space-y-5">
            <div className="card-surface rounded-2xl p-5 space-y-2">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">Tournament Rules</h2>
              <p className="text-sm text-slate-600 dark:text-[#A5B5AC] whitespace-pre-wrap leading-relaxed">
                {selectedTournament.rules}
              </p>
            </div>

            <div className="card-surface rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Submitted Match Results
              </h2>
              {matches.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">No match results submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {matches.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 rounded-xl inset-surface flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          Claimed Winner: {m.claimedWinnerName} vs {m.opponentName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-[#A5B5AC] mt-0.5">Score: {m.scoreSummary}</p>
                      </div>
                      <span
                        className={`text-xs font-medium inline-flex items-center gap-1 ${
                          m.verificationStatus === 'verified'
                            ? 'text-[#008F5B] dark:text-[#00D68F]'
                            : m.verificationStatus === 'rejected'
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-amber-600 dark:text-amber-300'
                        }`}
                      >
                        {m.verificationStatus === 'verified' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                        <span className="capitalize">{m.verificationStatus}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Participants Standings */}
          <aside className="lg:col-span-5 card-surface rounded-2xl p-5 space-y-4">
            <h2 className="text-base font-display font-semibold text-slate-900 dark:text-white">Registered Players</h2>
            {participants.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-[#A5B5AC]">No players joined yet.</p>
            ) : (
              <div className="space-y-2.5">
                {participants.map((p, idx) => (
                  <button
                    key={p.userId}
                    onClick={() => onOpenProfile(p.userId)}
                    className="w-full p-2.5 rounded-xl inset-surface hover:bg-slate-100 dark:hover:bg-white/5 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xs font-mono-tabular text-slate-500 dark:text-[#A5B5AC] w-5">
                        #{idx + 1}
                      </span>
                      <PlayerAvatar src={p.avatarUrl} name={p.fullName} size="xs" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{p.fullName}</p>
                        <p className="text-[11px] text-slate-500 dark:text-[#A5B5AC] truncate">@{p.username}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono-tabular text-[#008F5B] dark:text-[#00D68F]">{p.points} pts</span>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </div>

        {/* Submit Match Result Modal */}
        <ModalDialog
          open={submitMatchOpen}
          onClose={() => setSubmitMatchOpen(false)}
          title="Submit Match Score"
          subtitle="All submitted match outcomes are held for Admin verification."
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSubmitMatch} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">
                Opponent Name / Username
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                placeholder="e.g. @karim_queen"
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Match Winner</label>
              <select
                value={claimedWinnerId}
                onChange={(e) => setClaimedWinnerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
              >
                {participants.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.fullName} (@{p.username})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Score Summary</label>
              <input
                type="text"
                required
                maxLength={120}
                value={scoreSummary}
                onChange={(e) => setScoreSummary(e.target.value)}
                placeholder="2-1 (25-12, 18-25, 25-9)"
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white font-mono-tabular"
              />
            </div>

            <button
              type="submit"
              disabled={submittingMatch}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm"
            >
              {submittingMatch ? 'Submitting...' : 'Submit for Verification'}
            </button>
          </form>
        </ModalDialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('tournamentsTitle')}</h1>
          <p className="text-sm text-slate-600 dark:text-[#A5B5AC] mt-1">{t('tournamentsSub')}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {allowCreation && (
            <button
              onClick={() => setCreateOpen(true)}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-xs inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {t('createTournament')}
            </button>
          )}
        </div>
      </div>

      {tournaments.length === 0 ? (
          <EmptyState
            icon={<Trophy className="w-6 h-6" />}
            title="No tournaments hosted yet"
            description="Create a tournament bracket with clear rules and invite Carrom players."
            action={
              allowCreation ? (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-[#00D68F] text-[#080D0B] font-semibold text-xs"
                >
                  {t('createTournament')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {tournaments.map((tour) => (
              <div
                key={tour.id}
                onClick={() => setSelectedId(tour.id)}
                className="card-surface rounded-2xl overflow-hidden cursor-pointer hover:border-[#00A86B]/40 dark:hover:border-[#00D68F]/40 transition-all group flex flex-col"
              >
                <div className="h-36 relative bg-slate-200 dark:bg-[#080D0B] overflow-hidden">
                  <img
                    src={tour.coverUrl || CARROM_ASSETS.tournamentTrophy}
                    alt={tour.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#14221B] via-transparent to-transparent" />
                </div>
                <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white truncate">
                      {tour.name}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-[#A5B5AC] mt-1">
                      {tour.entryInfo} · <span className="capitalize">{tour.status.replace('_', ' ')}</span>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-[#00D68F]/10 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-[#A5B5AC] inline-flex items-center gap-1.5 tabular-nums">
                      <Users className="w-3.5 h-3.5 text-[#00A86B] dark:text-[#00D68F]" />
                      {tour.participantsCount}/{tour.maxPlayers}
                    </span>
                    {tour.winnerVerified && tour.winnerName ? (
                      <span className="text-[#008F5B] dark:text-[#00D68F] font-medium inline-flex items-center gap-1">
                        <Crown className="w-3.5 h-3.5" /> {tour.winnerName}
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-[#A5B5AC]">Open / Pending Verification</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
      )}

      {/* Create Tournament Modal */}
      <ModalDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Host Carrom Tournament"
        subtitle="Define entry details and match rules. Winners require admin verification."
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Tournament Name</label>
            <input
              type="text"
              required
              minLength={3}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Emerald Striker Cup 2026"
              className="w-full px-4 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Entry Information</label>
              <input
                type="text"
                required
                maxLength={200}
                value={entryInfo}
                onChange={(e) => setEntryInfo(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Max Players</label>
              <input
                type="number"
                min={2}
                max={256}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-xl inset-surface text-sm text-slate-900 dark:text-white font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Description</label>
            <textarea
              rows={2}
              maxLength={800}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Overview, schedule, and match format..."
              className="w-full p-3 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-600 dark:text-[#A5B5AC]">Tournament Rules</label>
            <textarea
              rows={3}
              required
              minLength={5}
              maxLength={1500}
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              className="w-full p-3 rounded-xl inset-surface text-sm text-slate-900 dark:text-white"
            />
          </div>

          <label className="block p-3 rounded-xl inset-surface text-xs text-slate-900 dark:text-white cursor-pointer text-center font-medium">
            {coverUrl ? 'Banner Image Selected' : 'Upload Tournament Banner (Optional)'}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => void handleCoverUpload(e.target.files?.[0])}
              className="hidden"
            />
          </label>

          <button
            type="submit"
            disabled={creating}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00D68F] to-[#00B87A] text-[#080D0B] font-semibold text-sm flex items-center justify-center gap-2"
          >
            {creating && <Loader2 className="w-4 h-4 animate-spin" />}
            Publish Tournament
          </button>
        </form>
      </ModalDialog>
    </div>
  );
}
