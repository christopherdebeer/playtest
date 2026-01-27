/**
 * File-based game state manager for subagent coordination
 *
 * All game state is stored in JSON files that subagents can read/write.
 * This enables coordination between independent Claude subagent instances.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import type { GameState, PlayerId, Card, Action } from '../core/types.js';
import type { GameRules } from '../rules/schema.js';
import { loadGameRules, rulesToConfig } from '../rules/parser.js';
import { createGameState, cloneGameState } from '../core/game-state.js';

const STATE_DIR = 'game-state';

export interface FileGameState {
  gameId: string;
  turn: number;
  phase: string;
  activePlayer: string;
  status: 'setup' | 'playing' | 'finished';
  winner?: string;
  endReason?: string;
  players: {
    player1: { life: number; mana: number };
    player2: { life: number; mana: number };
  };
  zones: {
    [key: string]: FileCard[];
  };
}

export interface FileCard {
  id: string;
  name: string;
  type: string;
  cost?: number;
  power?: number;
  toughness?: number;
  text?: string;
  tapped?: boolean;
  summoningSickness?: boolean;
  damage?: number;
}

export interface PendingMove {
  player: string;
  action: string | null;
  params: Record<string, unknown>;
  reasoning?: string;
  timestamp: string;
  status: 'pending' | 'submitted';
}

export interface FileValidationResult {
  valid: boolean;
  player?: string;
  action?: string;
  params?: Record<string, unknown>;
  stateChanges?: StateChangeFile[];
  reason?: string;
  message?: string;
  timestamp: string;
}

export interface StateChangeFile {
  type: string;
  player?: string;
  resource?: string;
  delta?: number;
  card?: string;
  from?: string;
  to?: string;
  property?: string;
  value?: unknown;
}

/**
 * Initialize the game state directory structure
 */
export function initializeStateDirectory(baseDir: string = '.'): void {
  const stateDir = join(baseDir, STATE_DIR);
  const movesDir = join(stateDir, 'pending-moves');

  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  if (!existsSync(movesDir)) {
    mkdirSync(movesDir, { recursive: true });
  }
}

/**
 * Initialize a new game from rules file and write to state files
 */
export function initializeGame(
  rulesPath: string,
  baseDir: string = '.'
): FileGameState {
  initializeStateDirectory(baseDir);

  const rules = loadGameRules(rulesPath);
  const config = rulesToConfig(rules);
  const state = createGameState(config, ['player1', 'player2']);

  // Create decks for each player
  const fileState: FileGameState = {
    gameId: randomUUID(),
    turn: 1,
    phase: 'upkeep',
    activePlayer: 'player1',
    status: 'playing',
    players: {
      player1: { life: 20, mana: 1 },
      player2: { life: 20, mana: 1 },
    },
    zones: {
      'player1:deck': [],
      'player1:hand': [],
      'player1:battlefield': [],
      'player1:discard': [],
      'player2:deck': [],
      'player2:hand': [],
      'player2:battlefield': [],
      'player2:discard': [],
    },
  };

  // Generate cards from rules
  const starterDeck = rules.card_sets?.starter_deck || [];
  for (const playerId of ['player1', 'player2']) {
    const deckCards: FileCard[] = [];

    for (const cardDef of starterDeck) {
      for (let i = 0; i < cardDef.count; i++) {
        deckCards.push({
          id: `${cardDef.id}_${randomUUID().slice(0, 8)}`,
          name: cardDef.name,
          type: cardDef.type,
          cost: cardDef.properties?.cost as number | undefined,
          power: cardDef.properties?.power as number | undefined,
          toughness: cardDef.properties?.toughness as number | undefined,
          text: cardDef.text,
        });
      }
    }

    // Shuffle deck
    for (let i = deckCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deckCards[i], deckCards[j]] = [deckCards[j], deckCards[i]];
    }

    // Draw starting hand
    const hand = deckCards.splice(0, 5);

    fileState.zones[`${playerId}:deck`] = deckCards;
    fileState.zones[`${playerId}:hand`] = hand;
  }

  // Write state files
  const stateDir = join(baseDir, STATE_DIR);
  writeFileSync(join(stateDir, 'board.json'), JSON.stringify(fileState, null, 2));
  writeFileSync(join(stateDir, 'rules.json'), JSON.stringify(rules, null, 2));
  writeFileSync(join(stateDir, 'turn-history.jsonl'), '');
  writeFileSync(join(stateDir, 'events.jsonl'), '');
  writeFileSync(
    join(stateDir, 'metrics.json'),
    JSON.stringify({ gamesPlayed: 0, turns: [], actions: [] }, null, 2)
  );

  // Initialize pending move files
  for (const playerId of ['player1', 'player2']) {
    writeFileSync(
      join(stateDir, 'pending-moves', `${playerId}.json`),
      JSON.stringify({
        player: playerId,
        action: null,
        params: {},
        timestamp: new Date().toISOString(),
        status: 'pending',
      }, null, 2)
    );
  }

  return fileState;
}

/**
 * Read current game state from file
 */
export function readGameState(baseDir: string = '.'): FileGameState | null {
  const boardPath = join(baseDir, STATE_DIR, 'board.json');
  if (!existsSync(boardPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(boardPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write game state to file
 */
export function writeGameState(state: FileGameState, baseDir: string = '.'): void {
  const boardPath = join(baseDir, STATE_DIR, 'board.json');
  writeFileSync(boardPath, JSON.stringify(state, null, 2));
}

/**
 * Read a player's pending move
 */
export function readPendingMove(
  playerId: string,
  baseDir: string = '.'
): PendingMove | null {
  const movePath = join(baseDir, STATE_DIR, 'pending-moves', `${playerId}.json`);
  if (!existsSync(movePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(movePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write a player's pending move
 */
export function writePendingMove(
  playerId: string,
  move: PendingMove,
  baseDir: string = '.'
): void {
  const movePath = join(baseDir, STATE_DIR, 'pending-moves', `${playerId}.json`);
  writeFileSync(movePath, JSON.stringify(move, null, 2));
}

/**
 * Read validation result
 */
export function readValidationResult(baseDir: string = '.'): FileValidationResult | null {
  const validationPath = join(baseDir, STATE_DIR, 'validation-result.json');
  if (!existsSync(validationPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(validationPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Write validation result
 */
export function writeValidationResult(
  result: FileValidationResult,
  baseDir: string = '.'
): void {
  const validationPath = join(baseDir, STATE_DIR, 'validation-result.json');
  writeFileSync(validationPath, JSON.stringify(result, null, 2));
}

/**
 * Append to turn history
 */
export function appendTurnHistory(
  action: {
    turn: number;
    player: string;
    action: string;
    params: Record<string, unknown>;
    result: { valid: boolean; message?: string };
  },
  baseDir: string = '.'
): void {
  const historyPath = join(baseDir, STATE_DIR, 'turn-history.jsonl');
  const line = JSON.stringify({ ...action, timestamp: new Date().toISOString() }) + '\n';
  writeFileSync(historyPath, readFileSync(historyPath, 'utf-8') + line);
}

/**
 * Apply validation result to game state
 */
export function applyValidationResult(
  state: FileGameState,
  validation: FileValidationResult
): FileGameState {
  if (!validation.valid || !validation.stateChanges) {
    return state;
  }

  const newState = JSON.parse(JSON.stringify(state)) as FileGameState;

  for (const change of validation.stateChanges) {
    switch (change.type) {
      case 'modify_resource':
        if (change.player && change.resource && change.delta !== undefined) {
          const player = change.player as 'player1' | 'player2';
          const resource = change.resource as 'life' | 'mana';
          newState.players[player][resource] += change.delta;
        }
        break;

      case 'move_card':
        if (change.card && change.from && change.to) {
          const fromZone = newState.zones[change.from];
          const toZone = newState.zones[change.to];
          if (fromZone && toZone) {
            const cardIndex = fromZone.findIndex(
              (c) => c.name === change.card || c.id === change.card
            );
            if (cardIndex !== -1) {
              const [card] = fromZone.splice(cardIndex, 1);
              toZone.push(card);
            }
          }
        }
        break;

      case 'set_property':
        if (change.card && change.property !== undefined && change.value !== undefined) {
          for (const zoneCards of Object.values(newState.zones)) {
            const card = zoneCards.find(
              (c) => c.name === change.card || c.id === change.card
            );
            if (card) {
              (card as unknown as Record<string, unknown>)[change.property] = change.value;
              break;
            }
          }
        }
        break;

      case 'deal_damage':
        if (change.player && change.delta !== undefined) {
          const player = change.player as 'player1' | 'player2';
          newState.players[player].life -= change.delta;
        }
        break;
    }
  }

  return newState;
}

/**
 * Format game state for display
 */
export function formatGameState(state: FileGameState): string {
  const lines: string[] = [];

  lines.push(`=== Turn ${state.turn} | Phase: ${state.phase} | Active: ${state.activePlayer} ===`);
  lines.push(`Status: ${state.status}`);
  lines.push('');

  for (const playerId of ['player1', 'player2'] as const) {
    const player = state.players[playerId];
    lines.push(`${playerId}: Life=${player.life} Mana=${player.mana}`);

    const hand = state.zones[`${playerId}:hand`];
    const handStr = hand
      .map((c) => (c.type === 'creature' ? `${c.name}(${c.cost})[${c.power}/${c.toughness}]` : `${c.name}(${c.cost})`))
      .join(', ');
    lines.push(`  Hand (${hand.length}): ${handStr || 'empty'}`);

    const battlefield = state.zones[`${playerId}:battlefield`];
    const bfStr = battlefield
      .map((c) => {
        let status = '';
        if (c.tapped) status += '[T]';
        if (c.summoningSickness) status += '[S]';
        return `${c.name}(${c.power}/${c.toughness})${status}`;
      })
      .join(', ');
    lines.push(`  Battlefield: ${bfStr || 'empty'}`);

    const deck = state.zones[`${playerId}:deck`];
    lines.push(`  Deck: ${deck.length} cards`);
    lines.push('');
  }

  return lines.join('\n');
}
