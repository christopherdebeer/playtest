/**
 * Dice Service
 *
 * Functions for dice rolling with various modes.
 * Uses Math.random() which can be seeded externally for deterministic tests.
 * Fires onDiceRolled hook via the registry after each roll.
 */

import type { GameState } from '../../types/game.js';
import { mechanicRegistry } from '../registry.js';

export interface DiceOptions {
  diceCount: number;
  diceSides: number;
  modifier?: number;
  keepIndices?: number[];
  previousResults?: number[];
}

export interface DiceResult {
  results: number[];
  total: number;
  modifier?: number;
  finalTotal?: number;
  keptDice?: number[];
  rerolledDice?: number[];
}

export interface RollCheckResult {
  success: boolean;
  margin: number;
  roll: DiceResult;
}

function rollOne(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function rollDice(_state: GameState, _playerId: string, options: DiceOptions): DiceResult {
  const { diceCount, diceSides, modifier = 0, keepIndices, previousResults } = options;
  let results: number[];
  let keptDice: number[] | undefined;
  let rerolledDice: number[] | undefined;

  if (keepIndices && previousResults) {
    results = new Array(diceCount);
    keptDice = [];
    rerolledDice = [];
    for (let i = 0; i < diceCount; i++) {
      if (keepIndices.includes(i)) {
        results[i] = previousResults[i];
        keptDice.push(previousResults[i]);
      } else {
        results[i] = rollOne(diceSides);
        rerolledDice.push(results[i]);
      }
    }
  } else {
    results = Array.from({ length: diceCount }, () => rollOne(diceSides));
  }

  const total = results.reduce((s, v) => s + v, 0);
  const finalTotal = modifier ? total + modifier : undefined;

  const result: DiceResult = {
    results,
    total,
    modifier: modifier || undefined,
    finalTotal,
    keptDice,
    rerolledDice,
  };

  // Fire onDiceRolled hook so mechanics (e.g., dice-rolling) can store results
  if (_state?.config) {
    mechanicRegistry.fire('dice', 'onDiceRolled', _state, _playerId, {
      results, total, modifier, finalTotal,
    });
  }

  return result;
}

export function rollD6(state: GameState, playerId: string, count: number): DiceResult {
  return rollDice(state, playerId, { diceCount: count, diceSides: 6 });
}

export function rollSingleDie(state: GameState, playerId: string, sides: number): DiceResult {
  return rollDice(state, playerId, { diceCount: 1, diceSides: sides });
}

export function rollForMovement(state: GameState, playerId: string): DiceResult {
  return rollDice(state, playerId, { diceCount: 1, diceSides: 6 });
}

export function rollCheck(
  state: GameState,
  playerId: string,
  target: number,
  options: DiceOptions
): RollCheckResult {
  const roll = rollDice(state, playerId, options);
  const total = roll.finalTotal ?? roll.total;
  return {
    success: total >= target,
    margin: total - target,
    roll,
  };
}

export function rollWithAdvantage(state: GameState, playerId: string, options: DiceOptions): DiceResult {
  const roll1 = rollDice(state, playerId, options);
  const roll2 = rollDice(state, playerId, options);
  return roll1.total >= roll2.total ? roll1 : roll2;
}

export function rollWithDisadvantage(state: GameState, playerId: string, options: DiceOptions): DiceResult {
  const roll1 = rollDice(state, playerId, options);
  const roll2 = rollDice(state, playerId, options);
  return roll1.total <= roll2.total ? roll1 : roll2;
}

export function rollExploding(state: GameState, playerId: string, count: number, sides: number): DiceResult {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    let val = rollOne(sides);
    results.push(val);
    while (val === sides) {
      val = rollOne(sides);
      results.push(val);
    }
  }
  const total = results.reduce((s, v) => s + v, 0);
  return { results, total };
}

export function countSuccesses(
  state: GameState,
  playerId: string,
  count: number,
  sides: number,
  threshold: number
): { successes: number; roll: DiceResult } {
  const roll = rollDice(state, playerId, { diceCount: count, diceSides: sides });
  const successes = roll.results.filter(r => r >= threshold).length;
  return { successes, roll };
}

export function parseDiceNotation(notation: string): { diceCount: number; diceSides: number; modifier: number } | null {
  if (!notation) return null;
  const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  return {
    diceCount: parseInt(match[1]),
    diceSides: parseInt(match[2]),
    modifier: match[3] ? parseInt(match[3]) : 0,
  };
}

export function rollFromNotation(state: GameState, playerId: string, notation: string): DiceResult | null {
  const parsed = parseDiceNotation(notation);
  if (!parsed) return null;
  return rollDice(state, playerId, parsed);
}
