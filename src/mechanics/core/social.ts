/**
 * Social (Voting) Service
 *
 * Pure state manipulation functions for voting sessions.
 * Voting state lives in state.shared.votingSessions and state.shared.activeVoteId.
 */

import type { GameState } from '../../types/game.js';

export interface VotingSession {
  id: string;
  topic: string;
  votes: Record<string, string | null>;
  eligibleVoters: string[];
  complete: boolean;
  type: 'plurality' | 'majority' | 'unanimous';
  tiebreaker: 'random' | 'none' | 'first_voter';
  validChoices?: string[];
  allowAbstain: boolean;
}

export interface VotingResult {
  winner: string | null;
  tied: boolean;
  tiedChoices?: string[];
  voteCounts: Record<string, number>;
  totalVotes: number;
  tiebreakerUsed?: string;
}

export interface CastVoteResult {
  success: boolean;
  error?: string;
}

export interface ValidateVoteResult {
  valid: boolean;
  error?: string;
}

function ensureSessions(state: GameState): Record<string, VotingSession> {
  if (!state.shared.votingSessions) state.shared.votingSessions = {};
  return state.shared.votingSessions as Record<string, VotingSession>;
}

function generateId(): string {
  return `vote-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function startVoting(
  state: GameState,
  topic: string,
  voters?: string[],
  options?: {
    type?: 'plurality' | 'majority' | 'unanimous';
    tiebreaker?: 'random' | 'none' | 'first_voter';
    validChoices?: string[];
    allowAbstain?: boolean;
  }
): string {
  const sessions = ensureSessions(state);
  const id = generateId();
  const eligibleVoters = voters ?? Object.keys(state.players);

  sessions[id] = {
    id,
    topic,
    votes: {},
    eligibleVoters,
    complete: false,
    type: options?.type ?? 'plurality',
    tiebreaker: options?.tiebreaker ?? 'random',
    validChoices: options?.validChoices,
    allowAbstain: options?.allowAbstain !== false,
  };

  state.shared.activeVoteId = id;
  return id;
}

export function castVote(state: GameState, voteId: string, playerId: string, choice: string | null): CastVoteResult {
  const sessions = ensureSessions(state);
  const session = sessions[voteId];

  if (!session) return { success: false, error: `Voting session ${voteId} not found` };
  if (session.complete) return { success: false, error: `Voting session ${voteId} is already complete` };
  if (!session.eligibleVoters.includes(playerId)) return { success: false, error: `${playerId} is not eligible to vote` };
  if (playerId in session.votes) return { success: false, error: `${playerId} has already voted` };
  if (choice === null && !session.allowAbstain) return { success: false, error: `Abstaining is not allowed` };
  if (choice !== null && session.validChoices && !session.validChoices.includes(choice)) {
    return { success: false, error: `Invalid choice: ${choice}` };
  }

  session.votes[playerId] = choice;

  // Auto-complete when all eligible voters have voted
  if (Object.keys(session.votes).length === session.eligibleVoters.length) {
    session.complete = true;
  }

  return { success: true };
}

export function getActiveVotingSession(state: GameState): VotingSession | null {
  const sessions = ensureSessions(state);
  const activeId = state.shared.activeVoteId as string | undefined;
  if (!activeId || !sessions[activeId]) return null;
  return sessions[activeId];
}

export function getVotingSession(state: GameState, voteId: string): VotingSession | null {
  const sessions = ensureSessions(state);
  return sessions[voteId] ?? null;
}

export function hasVoted(state: GameState, playerId: string): boolean {
  const session = getActiveVotingSession(state);
  if (!session) return false;
  return playerId in session.votes;
}

export function getPendingVoters(state: GameState): string[] {
  const session = getActiveVotingSession(state);
  if (!session) return [];
  return session.eligibleVoters.filter(v => !(v in session.votes));
}

export function isVotingComplete(state: GameState, voteId?: string): boolean {
  if (voteId) {
    const session = getVotingSession(state, voteId);
    return session?.complete ?? false;
  }
  const session = getActiveVotingSession(state);
  return session?.complete ?? false;
}

function tallyVotes(session: VotingSession): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const choice of Object.values(session.votes)) {
    if (choice !== null) {
      counts[choice] = (counts[choice] ?? 0) + 1;
    }
  }
  return counts;
}

export function getVotingResult(state: GameState, voteId?: string): VotingResult | null {
  const session = voteId ? getVotingSession(state, voteId) : getActiveVotingSession(state);
  if (!session || !session.complete) return null;

  const voteCounts = tallyVotes(session);
  const totalVotes = Object.values(voteCounts).reduce((s, v) => s + v, 0);
  const maxVotes = Math.max(...Object.values(voteCounts), 0);
  const topChoices = Object.entries(voteCounts).filter(([_, v]) => v === maxVotes).map(([k]) => k);

  if (session.type === 'unanimous') {
    if (topChoices.length === 1 && voteCounts[topChoices[0]] === session.eligibleVoters.length) {
      return { winner: topChoices[0], tied: false, voteCounts, totalVotes };
    }
    return { winner: null, tied: true, tiedChoices: topChoices, voteCounts, totalVotes };
  }

  if (session.type === 'majority') {
    const majority = session.eligibleVoters.length / 2;
    const majorityChoice = topChoices.find(c => voteCounts[c] > majority);
    if (majorityChoice) {
      return { winner: majorityChoice, tied: false, voteCounts, totalVotes };
    }
    return { winner: null, tied: true, tiedChoices: topChoices, voteCounts, totalVotes };
  }

  // plurality
  if (topChoices.length === 1) {
    return { winner: topChoices[0], tied: false, voteCounts, totalVotes };
  }

  // Tie
  if (session.tiebreaker === 'random') {
    const winner = topChoices[Math.floor(Math.random() * topChoices.length)];
    return { winner, tied: false, tiebreakerUsed: 'random', voteCounts, totalVotes };
  }

  return { winner: null, tied: true, tiedChoices: topChoices, voteCounts, totalVotes };
}

export function completeVoting(state: GameState, voteId: string): VotingResult | null {
  const session = getVotingSession(state, voteId);
  if (!session) return null;
  session.complete = true;
  return getVotingResult(state, voteId);
}

export function getVoteCounts(state: GameState, voteId?: string): Record<string, number> {
  const session = voteId ? getVotingSession(state, voteId) : getActiveVotingSession(state);
  if (!session) return {};
  return tallyVotes(session);
}

export function clearCompletedVotes(state: GameState, keepCount: number = 0): void {
  const sessions = ensureSessions(state);
  const completed = Object.entries(sessions)
    .filter(([_, s]) => s.complete)
    .sort(([a], [b]) => a.localeCompare(b));

  const toRemove = completed.length - keepCount;
  for (let i = 0; i < toRemove; i++) {
    delete sessions[completed[i][0]];
  }
}

export function validateVoteAction(state: GameState, playerId: string, choice: string): ValidateVoteResult {
  const session = getActiveVotingSession(state);
  if (!session) return { valid: false, error: 'No active voting session' };
  if (session.complete) return { valid: false, error: 'Voting is already complete' };
  if (!session.eligibleVoters.includes(playerId)) return { valid: false, error: `${playerId} is not eligible` };
  if (playerId in session.votes) return { valid: false, error: `${playerId} has already voted` };
  if (session.validChoices && !session.validChoices.includes(choice)) {
    return { valid: false, error: `Invalid choice: ${choice}` };
  }
  return { valid: true };
}
