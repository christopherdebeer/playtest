/**
 * Game state management - the core state machine
 */

import { randomUUID } from 'crypto';
import type {
  GameState,
  Zone,
  ZoneId,
  PlayerState,
  PlayerId,
  Card,
  CardId,
  Action,
  Resolution,
  SerializedGameState,
  GameConfig,
  StateChange,
} from './types.js';

/**
 * Create a new game state from configuration
 */
export function createGameState(config: GameConfig, playerIds: PlayerId[]): GameState {
  const zones = new Map<ZoneId, Zone>();
  const players = new Map<PlayerId, PlayerState>();

  // Create per-player zones and global zones
  for (const zoneDef of config.zones) {
    if (zoneDef.perPlayer) {
      for (const playerId of playerIds) {
        const zoneId = `${playerId}:${zoneDef.id}`;
        zones.set(zoneId, {
          id: zoneId,
          owner: playerId,
          visibility: zoneDef.visibility,
          cards: [],
          constraints: zoneDef.constraints,
        });
      }
    } else {
      zones.set(zoneDef.id, {
        id: zoneDef.id,
        visibility: zoneDef.visibility,
        cards: [],
        constraints: zoneDef.constraints,
      });
    }
  }

  // Create player states
  for (const playerId of playerIds) {
    const resources: Record<string, number> = {};
    for (const resDef of config.resources) {
      resources[resDef.id] = resDef.initial;
    }
    players.set(playerId, {
      id: playerId,
      name: playerId,
      resources,
      properties: {},
    });
  }

  return {
    id: randomUUID(),
    zones,
    players,
    globals: {
      gameName: config.name,
      turnStructure: config.turnStructure,
    },
    history: [],
    pendingResolutions: [],
    currentTurn: 0,
    currentPhase: config.turnStructure.phases[0],
    activePlayer: playerIds[0],
    status: 'setup',
  };
}

/**
 * Deep clone game state for branching/rollback
 */
export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    zones: new Map(
      Array.from(state.zones.entries()).map(([id, zone]) => [
        id,
        { ...zone, cards: zone.cards.map((c) => ({ ...c, properties: { ...c.properties } })) },
      ])
    ),
    players: new Map(
      Array.from(state.players.entries()).map(([id, player]) => [
        id,
        {
          ...player,
          resources: { ...player.resources },
          properties: { ...player.properties },
        },
      ])
    ),
    globals: JSON.parse(JSON.stringify(state.globals)),
    history: [...state.history],
    pendingResolutions: state.pendingResolutions.map((r) => ({ ...r, context: { ...r.context } })),
  };
}

/**
 * Apply state changes to game state
 */
export function applyStateChanges(state: GameState, changes: StateChange[]): GameState {
  const newState = cloneGameState(state);

  for (const change of changes) {
    switch (change.type) {
      case 'move_card': {
        const { cardId, fromZone, toZone, position } = change.details as {
          cardId: CardId;
          fromZone: ZoneId;
          toZone: ZoneId;
          position?: number;
        };
        const from = newState.zones.get(fromZone);
        const to = newState.zones.get(toZone);
        if (from && to) {
          const cardIndex = from.cards.findIndex((c) => c.id === cardId);
          if (cardIndex !== -1) {
            const [card] = from.cards.splice(cardIndex, 1);
            if (position !== undefined) {
              to.cards.splice(position, 0, card);
            } else {
              to.cards.push(card);
            }
          }
        }
        break;
      }
      case 'modify_resource': {
        const { playerId, resource, delta, absolute } = change.details as {
          playerId: PlayerId;
          resource: string;
          delta?: number;
          absolute?: number;
        };
        const player = newState.players.get(playerId);
        if (player) {
          if (absolute !== undefined) {
            player.resources[resource] = absolute;
          } else if (delta !== undefined) {
            player.resources[resource] = (player.resources[resource] || 0) + delta;
          }
        }
        break;
      }
      case 'modify_property': {
        const { target, targetType, property, value } = change.details as {
          target: string;
          targetType: 'player' | 'card' | 'global';
          property: string;
          value: unknown;
        };
        if (targetType === 'player') {
          const player = newState.players.get(target);
          if (player) player.properties[property] = value;
        } else if (targetType === 'global') {
          newState.globals[property] = value;
        } else if (targetType === 'card') {
          // Find card across all zones
          for (const zone of newState.zones.values()) {
            const card = zone.cards.find((c) => c.id === target);
            if (card) {
              card.properties[property] = value;
              break;
            }
          }
        }
        break;
      }
      case 'create_card': {
        const { card, zone } = change.details as { card: Card; zone: ZoneId };
        const targetZone = newState.zones.get(zone);
        if (targetZone) {
          targetZone.cards.push({ ...card, id: card.id || randomUUID() });
        }
        break;
      }
      case 'destroy_card': {
        const { cardId, fromZone } = change.details as { cardId: CardId; fromZone: ZoneId };
        const zone = newState.zones.get(fromZone);
        if (zone) {
          const cardIndex = zone.cards.findIndex((c) => c.id === cardId);
          if (cardIndex !== -1) {
            zone.cards.splice(cardIndex, 1);
          }
        }
        break;
      }
    }
  }

  return newState;
}

/**
 * Record an action in game history
 */
export function recordAction(state: GameState, action: Action): GameState {
  return {
    ...state,
    history: [...state.history, action],
  };
}

/**
 * Get visible state for a specific player
 */
export function getVisibleState(state: GameState, playerId: PlayerId): GameState {
  const visibleState = cloneGameState(state);

  // Filter zones based on visibility
  for (const [zoneId, zone] of visibleState.zones) {
    if (zone.visibility === 'hidden') {
      // Hidden from everyone except owner
      if (zone.owner !== playerId) {
        zone.cards = zone.cards.map((c) => ({
          id: c.id,
          name: '???',
          type: 'unknown',
          properties: {},
        }));
      }
    } else if (zone.visibility === 'private') {
      // Private to owner only
      if (zone.owner !== playerId) {
        zone.cards = zone.cards.map(() => ({
          id: 'hidden',
          name: '[hidden]',
          type: 'unknown',
          properties: {},
        }));
      }
    }
    // 'public' zones are fully visible
  }

  return visibleState;
}

/**
 * Serialize game state for LLM context
 */
export function serializeGameState(
  state: GameState,
  perspective?: PlayerId
): SerializedGameState {
  const viewState = perspective ? getVisibleState(state, perspective) : state;

  // Build human-readable format
  const lines: string[] = [];
  lines.push(`=== ${viewState.globals.gameName || 'Game'} ===`);
  lines.push(`Turn: ${viewState.currentTurn} | Phase: ${viewState.currentPhase} | Active: ${viewState.activePlayer}`);
  lines.push(`Status: ${viewState.status}`);
  lines.push('');

  // Players
  for (const [playerId, player] of viewState.players) {
    const resources = Object.entries(player.resources)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`${playerId}: ${resources}`);

    // Player zones
    for (const [zoneId, zone] of viewState.zones) {
      if (zone.owner === playerId) {
        const zoneName = zoneId.split(':')[1] || zoneId;
        if (zone.visibility === 'private' && zone.owner !== perspective) {
          lines.push(`  ${zoneName}: [${zone.cards.length} cards]`);
        } else {
          const cardStr = zone.cards.map((c) => formatCard(c)).join(', ');
          lines.push(`  ${zoneName}: [${cardStr || 'empty'}]`);
        }
      }
    }
    lines.push('');
  }

  // Global zones
  for (const [zoneId, zone] of viewState.zones) {
    if (!zone.owner) {
      const cardStr = zone.cards.map((c) => formatCard(c)).join(', ');
      lines.push(`${zoneId}: [${cardStr || 'empty'}]`);
    }
  }

  if (viewState.pendingResolutions.length > 0) {
    lines.push('');
    lines.push('Pending:');
    for (const res of viewState.pendingResolutions) {
      lines.push(`  - ${res.type}: waiting for ${res.waitingFor}`);
    }
  }

  return {
    formatted: lines.join('\n'),
    json: JSON.stringify(stateToJSON(viewState), null, 2),
    perspective,
  };
}

function formatCard(card: Card): string {
  if (card.name === '???' || card.name === '[hidden]') return card.name;
  const props = Object.entries(card.properties)
    .filter(([k]) => ['power', 'toughness', 'cost'].includes(k))
    .map(([k, v]) => `${k[0]}:${v}`)
    .join(',');
  return props ? `${card.name}(${props})` : card.name;
}

function stateToJSON(state: GameState): object {
  return {
    id: state.id,
    zones: Object.fromEntries(state.zones),
    players: Object.fromEntries(state.players),
    globals: state.globals,
    currentTurn: state.currentTurn,
    currentPhase: state.currentPhase,
    activePlayer: state.activePlayer,
    status: state.status,
    winner: state.winner,
    pendingResolutions: state.pendingResolutions,
    historyLength: state.history.length,
  };
}

/**
 * Find a card by ID across all zones
 */
export function findCard(state: GameState, cardId: CardId): { card: Card; zone: Zone } | null {
  for (const zone of state.zones.values()) {
    const card = zone.cards.find((c) => c.id === cardId);
    if (card) return { card, zone };
  }
  return null;
}

/**
 * Get player's zones
 */
export function getPlayerZones(state: GameState, playerId: PlayerId): Map<string, Zone> {
  const zones = new Map<string, Zone>();
  for (const [zoneId, zone] of state.zones) {
    if (zone.owner === playerId) {
      const simpleName = zoneId.split(':')[1] || zoneId;
      zones.set(simpleName, zone);
    }
  }
  return zones;
}
