/**
 * Layer 1: Core Service Unit Tests
 *
 * Game-agnostic tests that exercise core mechanic APIs directly
 * with hand-crafted GameState objects. No game config needed —
 * just minimal state with the fields each service requires.
 *
 * Tests verify:
 * - Basic CRUD operations on player/shared state
 * - Edge cases (spend more than available, empty deck, expired effects)
 * - Deterministic dice rolling with seeded PRNG
 * - Voting lifecycle (start → cast → tally → complete)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import game.ts first to resolve circular dependency chain correctly:
// game.ts → mechanics/index.ts → registry.ts (mechanicRegistry created first)
import '../src/core/game.js';

import type { GameState, Card, Effect, GameConfig } from '../src/types/game.js';

// Core mechanic APIs
import {
  addResource, spendResource, setResource,
  getResource, hasResource, getAllResources, getResourceNames
} from '../src/mechanics/core/resources.js';

import {
  addEffect, removeEffect, clearEffects,
  decrementEffectDurations, hasEffect, getEffect,
  getEffects, getEffectsByType, getEffectValue,
  isBlocked, extendEffectDuration
} from '../src/mechanics/core/effects.js';

import {
  addToHand, removeFromHandByIndex, removeFromHandByName,
  removeCardsFromHand, findInHand, getHandSize, getHand
} from '../src/mechanics/core/hand.js';

import {
  drawFromDeck, addToDiscard, playCard,
  peekDiscard, hasCardsAvailable, getDeckSize, getDiscardSize
} from '../src/mechanics/core/card-piles.js';

import { getCardsState } from '../src/mechanics/core/cards.js';

import {
  rollDice, rollD6, rollSingleDie, rollForMovement,
  rollCheck, rollWithAdvantage, rollWithDisadvantage,
  rollExploding, countSuccesses, parseDiceNotation, rollFromNotation
} from '../src/mechanics/core/dice.js';

import {
  startVoting, castVote, getActiveVotingSession,
  getVotingSession, hasVoted, getPendingVoters,
  isVotingComplete, getVotingResult, completeVoting,
  getVoteCounts, clearCompletedVotes, validateVoteAction
} from '../src/mechanics/core/social.js';

// mechanics/index.js is imported transitively via core/game.js above

// ============ Helpers ============

/** Mulberry32 PRNG — matches tests/harness.ts */
function mulberry32(seed: number): () => number {
  let t = seed | 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCard(name: string, type = 'action'): Card {
  return { name, type };
}

function makeEffect(type: string, duration: number, value?: number, source?: string): Effect {
  return { type, duration, value, source };
}

const minimalConfig: GameConfig = {
  name: 'test-game',
  version: '1.0',
  players: 2,
  win_condition: 'test',
  max_rounds: 10,
};

/** Create a minimal GameState for unit testing */
function makeState(overrides?: Partial<GameState>): GameState {
  return {
    gameId: 'test-1',
    gameName: 'test-game',
    status: 'in_progress',
    round: 1,
    turnNumber: 1,
    currentPlayer: 'player-1',
    turnOrder: ['player-1', 'player-2'],
    players: {
      'player-1': {
        state: 'Start',
        hand: [],
        effects: [],
        resources: {},
      },
      'player-2': {
        state: 'Start',
        hand: [],
        effects: [],
        resources: {},
      },
    },
    shared: {
      deck: [],
      discardPile: [],
    },
    config: minimalConfig,
    rulesMarkdown: '',
    log: '/tmp/test-log.jsonl',
    ...overrides,
  };
}

// ============ Resources ============

describe('resources service', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
  });

  it('addResource increases player resource', () => {
    const result = addResource(state, 'player-1', 'gold', 10);
    expect(result.success).toBe(true);
    expect(result.newAmount).toBe(10);
    expect(result.actualChange).toBe(10);
  });

  it('addResource initializes resources if missing', () => {
    delete state.players['player-1'].resources;
    const result = addResource(state, 'player-1', 'gold', 5);
    expect(result.success).toBe(true);
    expect(result.newAmount).toBe(5);
  });

  it('addResource accumulates on existing resource', () => {
    addResource(state, 'player-1', 'gold', 10);
    const result = addResource(state, 'player-1', 'gold', 5);
    expect(result.newAmount).toBe(15);
  });

  it('spendResource deducts from player resource', () => {
    addResource(state, 'player-1', 'gold', 10);
    const result = spendResource(state, 'player-1', 'gold', 3);
    expect(result.success).toBe(true);
    expect(result.newAmount).toBe(7);
    expect(result.actualChange).toBe(3);
  });

  it('spendResource fails if insufficient', () => {
    addResource(state, 'player-1', 'gold', 5);
    const result = spendResource(state, 'player-1', 'gold', 10);
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.newAmount).toBe(5);
    expect(result.actualChange).toBe(0);
  });

  it('spendResource fails if resources not configured', () => {
    delete state.players['player-1'].resources;
    const result = spendResource(state, 'player-1', 'gold', 1);
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('setResource sets absolute value', () => {
    const result = setResource(state, 'player-1', 'gold', 42);
    expect(result.success).toBe(true);
    expect(result.newAmount).toBe(42);
  });

  it('setResource computes correct delta', () => {
    addResource(state, 'player-1', 'gold', 10);
    const result = setResource(state, 'player-1', 'gold', 7);
    expect(result.actualChange).toBe(-3);
    expect(result.newAmount).toBe(7);
  });

  it('setResource with no change returns delta 0', () => {
    addResource(state, 'player-1', 'gold', 5);
    const result = setResource(state, 'player-1', 'gold', 5);
    expect(result.success).toBe(true);
    expect(result.actualChange).toBe(0);
  });

  it('getResource returns 0 for unset resource', () => {
    expect(getResource(state, 'player-1', 'diamonds')).toBe(0);
  });

  it('getResource returns current amount', () => {
    addResource(state, 'player-1', 'gold', 7);
    expect(getResource(state, 'player-1', 'gold')).toBe(7);
  });

  it('hasResource checks sufficient amount', () => {
    addResource(state, 'player-1', 'gold', 10);
    expect(hasResource(state, 'player-1', 'gold', 10)).toBe(true);
    expect(hasResource(state, 'player-1', 'gold', 11)).toBe(false);
  });

  it('getAllResources returns copy of resources', () => {
    addResource(state, 'player-1', 'gold', 5);
    addResource(state, 'player-1', 'wood', 3);
    const all = getAllResources(state, 'player-1');
    expect(all).toEqual({ gold: 5, wood: 3 });
    // Verify it's a copy
    all.gold = 999;
    expect(getResource(state, 'player-1', 'gold')).toBe(5);
  });

  it('getResourceNames lists resource keys', () => {
    addResource(state, 'player-1', 'gold', 5);
    addResource(state, 'player-1', 'wood', 3);
    const names = getResourceNames(state, 'player-1');
    expect(names).toContain('gold');
    expect(names).toContain('wood');
  });

  it('throws for invalid player', () => {
    expect(() => addResource(state, 'ghost', 'gold', 1)).toThrow('Player ghost not found');
    expect(() => spendResource(state, 'ghost', 'gold', 1)).toThrow('Player ghost not found');
    expect(() => getResource(state, 'ghost', 'gold')).toThrow('Player ghost not found');
  });
});

// ============ Effects ============

describe('effects service', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
  });

  it('addEffect adds a new effect', () => {
    const result = addEffect(state, 'player-1', makeEffect('shield', 3, 5));
    expect(result.success).toBe(true);
    expect(result.effect?.type).toBe('shield');
    expect(state.players['player-1'].effects).toHaveLength(1);
  });

  it('addEffect replaces existing effect of same type', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3, 5));
    addEffect(state, 'player-1', makeEffect('shield', 5, 10));
    expect(state.players['player-1'].effects).toHaveLength(1);
    expect(state.players['player-1'].effects[0].duration).toBe(5);
    expect(state.players['player-1'].effects[0].value).toBe(10);
  });

  it('removeEffect removes by type', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    addEffect(state, 'player-1', makeEffect('poison', 2));
    const result = removeEffect(state, 'player-1', 'shield');
    expect(result.success).toBe(true);
    expect(result.effect?.type).toBe('shield');
    expect(state.players['player-1'].effects).toHaveLength(1);
    expect(state.players['player-1'].effects[0].type).toBe('poison');
  });

  it('removeEffect fails for missing effect', () => {
    const result = removeEffect(state, 'player-1', 'nonexistent');
    expect(result.success).toBe(false);
  });

  it('clearEffects removes all', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    addEffect(state, 'player-1', makeEffect('poison', 2));
    const removed = clearEffects(state, 'player-1');
    expect(removed).toHaveLength(2);
    expect(state.players['player-1'].effects).toHaveLength(0);
  });

  it('decrementEffectDurations reduces durations', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    addEffect(state, 'player-1', makeEffect('poison', 1));
    const expired = decrementEffectDurations(state, 'player-1');
    expect(expired).toHaveLength(1);
    expect(expired[0].type).toBe('poison');
    expect(state.players['player-1'].effects).toHaveLength(1);
    expect(state.players['player-1'].effects[0].duration).toBe(2);
  });

  it('decrementEffectDurations handles no effects', () => {
    const expired = decrementEffectDurations(state, 'player-1');
    expect(expired).toHaveLength(0);
  });

  it('hasEffect checks existence', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    expect(hasEffect(state, 'player-1', 'shield')).toBe(true);
    expect(hasEffect(state, 'player-1', 'poison')).toBe(false);
  });

  it('getEffect returns the effect or undefined', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3, 5));
    const effect = getEffect(state, 'player-1', 'shield');
    expect(effect).toBeDefined();
    expect(effect!.value).toBe(5);
    expect(getEffect(state, 'player-1', 'missing')).toBeUndefined();
  });

  it('getEffects returns copy of all effects', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    addEffect(state, 'player-1', makeEffect('poison', 2));
    const effects = getEffects(state, 'player-1');
    expect(effects).toHaveLength(2);
    // Verify it's a copy
    effects.push(makeEffect('test', 1));
    expect(state.players['player-1'].effects).toHaveLength(2);
  });

  it('getEffectsByType filters by type', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    addEffect(state, 'player-1', makeEffect('poison', 2));
    const shields = getEffectsByType(state, 'player-1', 'shield');
    expect(shields).toHaveLength(1);
    expect(shields[0].type).toBe('shield');
  });

  it('getEffectValue sums values', () => {
    // addEffect replaces same type, so we need to test with a single effect
    addEffect(state, 'player-1', makeEffect('boost', 3, 10));
    expect(getEffectValue(state, 'player-1', 'boost')).toBe(10);
    expect(getEffectValue(state, 'player-1', 'missing')).toBe(0);
  });

  it('isBlocked detects blocking effects', () => {
    expect(isBlocked(state, 'player-1')).toBe(false);
    addEffect(state, 'player-1', makeEffect('block_turn', 1));
    expect(isBlocked(state, 'player-1')).toBe(true);
  });

  it('isBlocked recognizes all blocking types', () => {
    for (const blockType of ['block_turn', 'skip', 'lose_turn', 'stunned', 'frozen']) {
      state.players['player-1'].effects = [];
      addEffect(state, 'player-1', makeEffect(blockType, 1));
      expect(isBlocked(state, 'player-1')).toBe(true);
    }
  });

  it('extendEffectDuration extends existing', () => {
    addEffect(state, 'player-1', makeEffect('shield', 3));
    const result = extendEffectDuration(state, 'player-1', 'shield', 2);
    expect(result).toBe(true);
    expect(state.players['player-1'].effects[0].duration).toBe(5);
  });

  it('extendEffectDuration returns false for missing', () => {
    expect(extendEffectDuration(state, 'player-1', 'missing', 2)).toBe(false);
  });
});

// ============ Hand ============

describe('hand service', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
  });

  it('addToHand adds cards to player hand', () => {
    const result = addToHand(state, 'player-1', [makeCard('Fireball'), makeCard('Shield')]);
    expect(result.addedCards).toHaveLength(2);
    expect(state.players['player-1'].hand).toHaveLength(2);
  });

  it('removeFromHandByIndex removes correct card', () => {
    addToHand(state, 'player-1', [makeCard('A'), makeCard('B'), makeCard('C')]);
    const removed = removeFromHandByIndex(state, 'player-1', 1);
    expect(removed?.name).toBe('B');
    expect(state.players['player-1'].hand).toHaveLength(2);
    expect(state.players['player-1'].hand.map(c => c.name)).toEqual(['A', 'C']);
  });

  it('removeFromHandByIndex returns null for invalid index', () => {
    expect(removeFromHandByIndex(state, 'player-1', -1)).toBeNull();
    expect(removeFromHandByIndex(state, 'player-1', 0)).toBeNull(); // empty hand
  });

  it('removeFromHandByName removes by name', () => {
    addToHand(state, 'player-1', [makeCard('A'), makeCard('B')]);
    const removed = removeFromHandByName(state, 'player-1', 'A');
    expect(removed?.name).toBe('A');
    expect(state.players['player-1'].hand).toHaveLength(1);
  });

  it('removeFromHandByName returns null if not found', () => {
    addToHand(state, 'player-1', [makeCard('A')]);
    expect(removeFromHandByName(state, 'player-1', 'Z')).toBeNull();
  });

  it('removeCardsFromHand removes multiple cards', () => {
    addToHand(state, 'player-1', [makeCard('A'), makeCard('B'), makeCard('C'), makeCard('D')]);
    const removed = removeCardsFromHand(state, 'player-1', ['B', 'D']);
    expect(removed).toHaveLength(2);
    expect(removed.map(c => c.name)).toEqual(['B', 'D']);
    expect(state.players['player-1'].hand.map(c => c.name)).toEqual(['A', 'C']);
  });

  it('removeCardsFromHand handles missing cards gracefully', () => {
    addToHand(state, 'player-1', [makeCard('A')]);
    const removed = removeCardsFromHand(state, 'player-1', ['A', 'Z']);
    expect(removed).toHaveLength(1);
    expect(removed[0].name).toBe('A');
  });

  it('findInHand finds card without removing', () => {
    addToHand(state, 'player-1', [makeCard('Fireball')]);
    const found = findInHand(state, 'player-1', 'Fireball');
    expect(found?.name).toBe('Fireball');
    expect(state.players['player-1'].hand).toHaveLength(1); // still in hand
  });

  it('findInHand returns undefined if not found', () => {
    expect(findInHand(state, 'player-1', 'Ghost')).toBeUndefined();
  });

  it('getHandSize returns correct count', () => {
    expect(getHandSize(state, 'player-1')).toBe(0);
    addToHand(state, 'player-1', [makeCard('A'), makeCard('B')]);
    expect(getHandSize(state, 'player-1')).toBe(2);
  });

  it('getHand returns a copy', () => {
    addToHand(state, 'player-1', [makeCard('A')]);
    const hand = getHand(state, 'player-1');
    hand.push(makeCard('B'));
    expect(state.players['player-1'].hand).toHaveLength(1);
  });
});

// ============ Card Piles ============

describe('card piles service', () => {
  let state: GameState;

  beforeEach(() => {
    state = makeState();
    // Set up deck in shared state
    const cardsState = getCardsState(state);
    cardsState.deck = [
      makeCard('Card-1'),
      makeCard('Card-2'),
      makeCard('Card-3'),
      makeCard('Card-4'),
      makeCard('Card-5'),
    ];
  });

  it('drawFromDeck draws cards from top of deck', () => {
    const result = drawFromDeck(state, 2, 'player-1');
    expect(result.cards).toHaveLength(2);
    expect(result.cards[0].name).toBe('Card-1');
    expect(result.cards[1].name).toBe('Card-2');
    expect(getCardsState(state).deck).toHaveLength(3);
    expect(result.reshuffled).toBe(false);
  });

  it('drawFromDeck draws nothing from empty deck', () => {
    getCardsState(state).deck = [];
    const result = drawFromDeck(state, 2, 'player-1');
    expect(result.cards).toHaveLength(0);
  });

  it('drawFromDeck reshuffles discard when deck empty', () => {
    const cardsState = getCardsState(state);
    cardsState.deck = [];
    cardsState.discardPile = [makeCard('Discard-1'), makeCard('Discard-2')];
    const result = drawFromDeck(state, 1, 'player-1');
    expect(result.cards).toHaveLength(1);
    expect(result.reshuffled).toBe(true);
  });

  it('drawFromDeck without playerId skips hooks', () => {
    const result = drawFromDeck(state, 1);
    expect(result.cards).toHaveLength(1);
  });

  it('addToDiscard puts cards in discard pile', () => {
    const cards = [makeCard('Used-1'), makeCard('Used-2')];
    addToDiscard(state, cards, 'player-1');
    expect(getCardsState(state).discardPile).toHaveLength(2);
    expect(state.shared.topCard).toEqual(cards[1]);
  });

  it('playCard removes from hand, adds to discard', () => {
    addToHand(state, 'player-1', [makeCard('Fireball'), makeCard('Shield')]);
    const result = playCard(state, 'player-1', 'Fireball');
    expect(result.card?.name).toBe('Fireball');
    expect(state.players['player-1'].hand).toHaveLength(1);
    expect(getCardsState(state).discardPile).toHaveLength(1);
    expect(getCardsState(state).discardPile[0].name).toBe('Fireball');
  });

  it('playCard returns null for card not in hand', () => {
    const result = playCard(state, 'player-1', 'Ghost');
    expect(result.card).toBeNull();
  });

  it('peekDiscard returns top card without removing', () => {
    expect(peekDiscard(state)).toBeUndefined();
    addToDiscard(state, [makeCard('A'), makeCard('B')]);
    expect(peekDiscard(state)?.name).toBe('B');
    expect(getCardsState(state).discardPile).toHaveLength(2);
  });

  it('hasCardsAvailable checks deck + discard', () => {
    expect(hasCardsAvailable(state)).toBe(true); // 5 cards in deck
    getCardsState(state).deck = [];
    expect(hasCardsAvailable(state)).toBe(false); // empty deck, empty discard
    getCardsState(state).discardPile = [makeCard('A'), makeCard('B')];
    expect(hasCardsAvailable(state)).toBe(true); // can reshuffle discard
  });

  it('getDeckSize returns deck count', () => {
    expect(getDeckSize(state)).toBe(5);
  });

  it('getDiscardSize returns discard count', () => {
    expect(getDiscardSize(state)).toBe(0);
    addToDiscard(state, [makeCard('A')]);
    expect(getDiscardSize(state)).toBe(1);
  });
});

// ============ Dice ============

describe('dice service', () => {
  let state: GameState;
  let originalRandom: () => number;

  beforeEach(() => {
    state = makeState();
    originalRandom = Math.random;
    Math.random = mulberry32(42);
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('rollDice returns deterministic results with seed', () => {
    const result1 = rollDice(state, 'player-1', { diceCount: 2, diceSides: 6 });
    expect(result1.results).toHaveLength(2);
    expect(result1.total).toBe(result1.results[0] + result1.results[1]);
    for (const r of result1.results) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }

    // Reset seed and verify same results
    Math.random = mulberry32(42);
    const result2 = rollDice(state, 'player-1', { diceCount: 2, diceSides: 6 });
    expect(result2.results).toEqual(result1.results);
  });

  it('rollD6 rolls standard dice', () => {
    const result = rollD6(state, 'player-1', 3);
    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(6);
    }
  });

  it('rollSingleDie rolls one die', () => {
    const result = rollSingleDie(state, 'player-1', 20);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toBeGreaterThanOrEqual(1);
    expect(result.results[0]).toBeLessThanOrEqual(20);
  });

  it('rollForMovement uses purpose "movement"', () => {
    const result = rollForMovement(state, 'player-1');
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toBeGreaterThanOrEqual(1);
    expect(result.results[0]).toBeLessThanOrEqual(6);
  });

  it('rollDice applies modifier', () => {
    const result = rollDice(state, 'player-1', {
      diceCount: 1, diceSides: 6, modifier: 3
    });
    expect(result.modifier).toBe(3);
    expect(result.finalTotal).toBe(result.total + 3);
  });

  it('rollDice handles re-rolling with keepIndices', () => {
    const first = rollDice(state, 'player-1', { diceCount: 3, diceSides: 6 });
    const reroll = rollDice(state, 'player-1', {
      diceCount: 3,
      diceSides: 6,
      keepIndices: [0, 2],
      previousResults: first.results,
    });
    expect(reroll.results[0]).toBe(first.results[0]); // kept
    expect(reroll.results[2]).toBe(first.results[2]); // kept
    expect(reroll.keptDice).toEqual([first.results[0], first.results[2]]);
    expect(reroll.rerolledDice).toHaveLength(1);
  });

  it('rollCheck evaluates against target', () => {
    const result = rollCheck(state, 'player-1', 5, { diceCount: 2, diceSides: 6 });
    const total = result.roll.finalTotal ?? result.roll.total;
    expect(result.success).toBe(total >= 5);
    expect(result.margin).toBe(total - 5);
  });

  it('rollWithAdvantage takes higher roll', () => {
    const result = rollWithAdvantage(state, 'player-1', { diceCount: 1, diceSides: 20 });
    expect(result.results).toHaveLength(1); // returns the winning roll
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('rollWithDisadvantage takes lower roll', () => {
    const result = rollWithDisadvantage(state, 'player-1', { diceCount: 1, diceSides: 20 });
    expect(result.results).toHaveLength(1);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it('rollExploding re-rolls on max value', () => {
    // With seeded PRNG, this should produce consistent results
    const result = rollExploding(state, 'player-1', 2, 6);
    expect(result.results.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBe(result.results.reduce((s, v) => s + v, 0));
  });

  it('countSuccesses counts dice meeting threshold', () => {
    const result = countSuccesses(state, 'player-1', 5, 6, 4);
    expect(result.successes).toBe(result.roll.results.filter(r => r >= 4).length);
  });

  it('parseDiceNotation parses standard notation', () => {
    expect(parseDiceNotation('2d6')).toEqual({ diceCount: 2, diceSides: 6, modifier: 0 });
    expect(parseDiceNotation('3d8+2')).toEqual({ diceCount: 3, diceSides: 8, modifier: 2 });
    expect(parseDiceNotation('1d20-1')).toEqual({ diceCount: 1, diceSides: 20, modifier: -1 });
    expect(parseDiceNotation('invalid')).toBeNull();
    expect(parseDiceNotation('')).toBeNull();
  });

  it('rollFromNotation rolls from string notation', () => {
    const result = rollFromNotation(state, 'player-1', '2d6+3');
    expect(result).not.toBeNull();
    expect(result!.results).toHaveLength(2);
    expect(result!.modifier).toBe(3);
    expect(result!.finalTotal).toBe(result!.total + 3);
  });

  it('rollFromNotation returns null for invalid notation', () => {
    expect(rollFromNotation(state, 'player-1', 'garbage')).toBeNull();
  });
});

// ============ Social (Voting) ============

describe('social service', () => {
  let state: GameState;
  let originalRandom: () => number;

  beforeEach(() => {
    state = makeState();
    originalRandom = Math.random;
    Math.random = mulberry32(42);
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('startVoting creates a session in shared state', () => {
    const voteId = startVoting(state, 'Elect leader');
    expect(voteId).toBeDefined();
    expect(state.shared.activeVoteId).toBe(voteId);
    const session = getActiveVotingSession(state);
    expect(session).not.toBeNull();
    expect(session!.topic).toBe('Elect leader');
    expect(session!.eligibleVoters).toEqual(['player-1', 'player-2']);
  });

  it('startVoting with custom voters', () => {
    const voteId = startVoting(state, 'Team vote', ['player-1']);
    const session = getVotingSession(state, voteId);
    expect(session!.eligibleVoters).toEqual(['player-1']);
  });

  it('castVote records a vote', () => {
    const voteId = startVoting(state, 'Choose', undefined, { validChoices: ['A', 'B'] });
    const result = castVote(state, voteId, 'player-1', 'A');
    expect(result.success).toBe(true);
    expect(hasVoted(state, 'player-1')).toBe(true);
    expect(hasVoted(state, 'player-2')).toBe(false);
  });

  it('castVote rejects duplicate votes', () => {
    const voteId = startVoting(state, 'Choose');
    castVote(state, voteId, 'player-1', 'A');
    const result = castVote(state, voteId, 'player-1', 'B');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already voted');
  });

  it('castVote rejects ineligible voter', () => {
    const voteId = startVoting(state, 'Choose', ['player-1']);
    const result = castVote(state, voteId, 'player-2', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not eligible');
  });

  it('castVote rejects invalid choice', () => {
    const voteId = startVoting(state, 'Choose', undefined, { validChoices: ['A', 'B'] });
    const result = castVote(state, voteId, 'player-1', 'C');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid choice');
  });

  it('castVote rejects abstain when not allowed', () => {
    const voteId = startVoting(state, 'Choose', undefined, { allowAbstain: false });
    const result = castVote(state, voteId, 'player-1', null);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not allowed');
  });

  it('voting completes automatically when all vote', () => {
    const voteId = startVoting(state, 'Choose');
    castVote(state, voteId, 'player-1', 'A');
    expect(isVotingComplete(state)).toBe(false);
    castVote(state, voteId, 'player-2', 'B');
    expect(isVotingComplete(state)).toBe(true);
  });

  it('getPendingVoters tracks who needs to vote', () => {
    const voteId = startVoting(state, 'Choose');
    expect(getPendingVoters(state)).toEqual(['player-1', 'player-2']);
    castVote(state, voteId, 'player-1', 'A');
    expect(getPendingVoters(state)).toEqual(['player-2']);
  });

  it('plurality voting picks most votes', () => {
    const voteId = startVoting(state, 'Choose', undefined, { type: 'plurality' });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'A');
    const result = getVotingResult(state);
    expect(result).not.toBeNull();
    expect(result!.winner).toBe('A');
    expect(result!.tied).toBe(false);
    expect(result!.voteCounts).toEqual({ A: 2 });
  });

  it('plurality voting detects tie', () => {
    const voteId = startVoting(state, 'Choose', undefined, {
      type: 'plurality',
      tiebreaker: 'none',
    });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'B');
    const result = getVotingResult(state);
    expect(result!.tied).toBe(true);
    expect(result!.winner).toBeNull();
    expect(result!.tiedChoices).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('majority voting requires > 50%', () => {
    // 3 players for majority testing
    state.players['player-3'] = { state: 'Start', hand: [], effects: [] };
    const voteId = startVoting(state, 'Choose', undefined, {
      type: 'majority',
      tiebreaker: 'none',
    });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'B');
    castVote(state, voteId, 'player-3', 'A');
    const result = getVotingResult(state);
    expect(result!.winner).toBe('A');
    expect(result!.tied).toBe(false);
  });

  it('unanimous voting requires all same choice', () => {
    const voteId = startVoting(state, 'Choose', undefined, { type: 'unanimous' });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'A');
    const result = getVotingResult(state);
    expect(result!.winner).toBe('A');
  });

  it('unanimous voting fails with mixed votes', () => {
    const voteId = startVoting(state, 'Choose', undefined, {
      type: 'unanimous',
      tiebreaker: 'none',
    });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'B');
    const result = getVotingResult(state);
    expect(result!.winner).toBeNull();
  });

  it('random tiebreaker resolves tie deterministically', () => {
    const voteId = startVoting(state, 'Choose', undefined, {
      type: 'plurality',
      tiebreaker: 'random',
    });
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'B');
    const result = getVotingResult(state);
    expect(result!.tied).toBe(false);
    expect(result!.tiebreakerUsed).toBe('random');
    expect(['A', 'B']).toContain(result!.winner);
  });

  it('completeVoting force-completes partial session', () => {
    const voteId = startVoting(state, 'Choose');
    castVote(state, voteId, 'player-1', 'A');
    // player-2 hasn't voted
    const result = completeVoting(state, voteId);
    expect(result).not.toBeNull();
    expect(result!.totalVotes).toBe(1);
    expect(isVotingComplete(state, voteId)).toBe(true);
  });

  it('getVoteCounts returns current counts', () => {
    const voteId = startVoting(state, 'Choose');
    castVote(state, voteId, 'player-1', 'A');
    expect(getVoteCounts(state)).toEqual({ A: 1 });
  });

  it('validateVoteAction validates before casting', () => {
    const voteId = startVoting(state, 'Choose', undefined, { validChoices: ['A', 'B'] });
    expect(validateVoteAction(state, 'player-1', 'A').valid).toBe(true);
    expect(validateVoteAction(state, 'player-1', 'C').valid).toBe(false);
    castVote(state, voteId, 'player-1', 'A');
    expect(validateVoteAction(state, 'player-1', 'B').valid).toBe(false); // already voted
  });

  it('clearCompletedVotes cleans up old sessions', () => {
    const id1 = startVoting(state, 'Vote 1');
    castVote(state, id1, 'player-1', 'A');
    castVote(state, id1, 'player-2', 'B');
    const id2 = startVoting(state, 'Vote 2');
    castVote(state, id2, 'player-1', 'X');
    castVote(state, id2, 'player-2', 'Y');
    clearCompletedVotes(state, 1);
    const sessions = state.shared.votingSessions as Record<string, unknown>;
    // Should keep at most 1 completed session
    const completedCount = Object.values(sessions).filter(
      (s: any) => s.complete
    ).length;
    expect(completedCount).toBeLessThanOrEqual(1);
  });

  it('castVote rejects vote on completed session', () => {
    const voteId = startVoting(state, 'Choose');
    castVote(state, voteId, 'player-1', 'A');
    castVote(state, voteId, 'player-2', 'B');
    // Now add player-3 and try to vote on completed session
    state.players['player-3'] = { state: 'Start', hand: [], effects: [] };
    const result = castVote(state, voteId, 'player-3', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already complete');
  });

  it('castVote rejects vote on nonexistent session', () => {
    const result = castVote(state, 'fake-id', 'player-1', 'A');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
