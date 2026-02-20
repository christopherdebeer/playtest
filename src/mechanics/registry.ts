/**
 * Mechanic Registry - Minimal stub.
 * All mechanic execution now routes through the Lean engine.
 * This file provides no-op implementations for any remaining game.ts references.
 */

import type { StateChanges, ActionExecutionResult } from './types.js';
import type { GameState, GameConfig, GameAction } from '../types/game.js';

export interface MechanicValidationError {
  mechanic: string;
  type: 'missing_dependency' | 'conflict';
  message: string;
}

export interface MechanicMetadata {
  slug: string;
  name: string;
  configKey: string;
  hooks: string[];
}

export function getMechanicRequires(): string[] {
  return [];
}

class MechanicRegistry {
  register(): void {
    // No-op: Lean engine handles all mechanics
  }

  installDependencyResolver(): void {
    // No-op
  }

  validateDependencies(_config: GameConfig): MechanicValidationError[] {
    return [];
  }

  getEnabledMechanics(_config: GameConfig): string[] {
    return [];
  }

  // All hook routing stubs — return empty/no-op results
  preValidateAction(_state: GameState, _playerId: string, _action: GameAction): { valid: boolean; error?: string } {
    return { valid: true };
  }

  executeAction(_state: GameState, _playerId: string, _action: GameAction): ActionExecutionResult | null {
    return null;
  }

  postExecuteAction(_state: GameState, _playerId: string, _action: GameAction): StateChanges {
    return {};
  }

  shouldAutoEndTurn(_state: GameState, _playerId: string): boolean {
    return false;
  }

  getAvailableActions(_state: GameState, _playerId: string): { action: GameAction; category?: string; enabled?: boolean; reason?: string }[] {
    return [];
  }

  onTurnStart(_state: GameState, _playerId: string, _isNewRound: boolean): StateChanges {
    return {};
  }

  onTurnEnd(_state: GameState, _playerId: string, _nextPlayerId: string, _isRoundEnd: boolean): StateChanges {
    return {};
  }

  checkAllWinConditions(_state: GameState, _trigger: string): { playerId: string; reason: string } | null {
    return null;
  }

  initSharedState(_config: GameConfig, _deck: unknown[], _turnOrder: string[], _shared: Record<string, unknown>): Record<string, unknown> {
    return {};
  }

  initPlayerState(_config: GameConfig, _playerId: string, _playerIndex: number, _players: Record<string, unknown>, _shared: Record<string, unknown>): Record<string, unknown> {
    return {};
  }

  getPlayerView(_state: GameState, _playerId: string): Record<string, unknown> {
    return {};
  }

  canPlayerActNow(_state: GameState, _playerId: string): boolean {
    return false;
  }

  isPlayerBlocked(_state: GameState, _playerId: string): boolean {
    return false;
  }

  getActionSchema(_state: GameState, _action: GameAction): { required?: string[]; optional?: string[] } | null {
    return null;
  }

  getRegisteredMechanicsMetadata(): MechanicMetadata[] {
    return [];
  }

  fire(_definerSlug: string, _hookName: string, ..._args: unknown[]): unknown[] {
    return [];
  }

  getHighlights(_config: GameConfig): string[] {
    return [];
  }
}

export const mechanicRegistry = new MechanicRegistry();

export function applyStateChanges(state: GameState, changes: StateChanges): void {
  if (!changes) return;
  if (changes.playerStateChanges) {
    for (const [pid, playerChanges] of Object.entries(changes.playerStateChanges)) {
      if (state.players[pid]) {
        Object.assign(state.players[pid], playerChanges);
      }
    }
  }
  if (changes.sharedStateChanges) {
    Object.assign(state.shared, changes.sharedStateChanges);
  }
}

export function getRegisteredMechanicsMetadata(): MechanicMetadata[] {
  return [];
}
