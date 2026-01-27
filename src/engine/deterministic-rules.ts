/**
 * Deterministic Rules Engine
 *
 * Handles action validation and effect execution without LLM calls.
 * All game logic is implemented deterministically based on rule definitions.
 */

import type {
  GameState,
  PlayerId,
  Card,
  StateChange,
  Zone,
} from '../core/types.js';
import { getPlayerZones, findCard } from '../core/game-state.js';
import type { GameRules } from '../rules/schema.js';
import type { ParsedAction, GameEventInfo, CardInfo } from './game-server.js';

/**
 * Result of executing an effect
 */
export interface EffectResult {
  success: boolean;
  message?: string;
  stateChanges: StateChange[];
  events: GameEventInfo[];
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Action option for Claude to choose from
 */
export interface ActionOption {
  action: string;
  description: string;
  params?: Record<string, string>;
  example?: string;
  affordable?: CardInfo[];
  attackers?: CardInfo[];
}

/**
 * Validate an action is legal in the current state
 */
export function validateAction(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction,
  rules: GameRules
): ValidationResult {
  const player = state.players.get(playerId);
  if (!player) {
    return { valid: false, message: 'Player not found' };
  }

  const phase = state.currentPhase;

  switch (action.type) {
    case 'pass':
      return { valid: true };

    case 'play_creature':
      return validatePlayCreature(state, playerId, action, rules);

    case 'play_spell':
      return validatePlaySpell(state, playerId, action, rules);

    case 'attack':
      return validateAttack(state, playerId, action, rules);

    case 'draw':
      if (phase !== 'upkeep') {
        return { valid: false, message: 'Can only draw during upkeep phase' };
      }
      const deck = state.zones.get(`${playerId}:deck`);
      if (!deck || deck.cards.length === 0) {
        return { valid: false, message: 'Deck is empty' };
      }
      return { valid: true };

    default:
      return { valid: false, message: `Unknown action type: ${action.type}` };
  }
}

/**
 * Validate play_creature action
 */
function validatePlayCreature(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction,
  rules: GameRules
): ValidationResult {
  if (state.currentPhase !== 'main') {
    return { valid: false, message: 'Can only play creatures during main phase' };
  }

  const hand = state.zones.get(`${playerId}:hand`);
  if (!hand) {
    return { valid: false, message: 'Hand zone not found' };
  }

  const cardName = action.params.card;
  if (!cardName) {
    return { valid: false, message: 'Must specify a card to play' };
  }

  const card = hand.cards.find(
    (c) => c.name.toLowerCase() === cardName.toLowerCase() || c.id === cardName
  );
  if (!card) {
    return { valid: false, message: `Card "${cardName}" not found in hand` };
  }

  if (card.type !== 'creature') {
    return { valid: false, message: `${card.name} is not a creature` };
  }

  const player = state.players.get(playerId)!;
  const cost = (card.properties.cost as number) || 0;
  if ((player.resources.mana || 0) < cost) {
    return { valid: false, message: `Not enough mana (need ${cost}, have ${player.resources.mana})` };
  }

  const battlefield = state.zones.get(`${playerId}:battlefield`);
  if (battlefield && battlefield.cards.length >= 5) {
    return { valid: false, message: 'Battlefield is full (max 5 creatures)' };
  }

  return { valid: true };
}

/**
 * Validate play_spell action
 */
function validatePlaySpell(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction,
  rules: GameRules
): ValidationResult {
  if (state.currentPhase !== 'main') {
    return { valid: false, message: 'Can only play spells during main phase' };
  }

  const hand = state.zones.get(`${playerId}:hand`);
  if (!hand) {
    return { valid: false, message: 'Hand zone not found' };
  }

  const cardName = action.params.card;
  if (!cardName) {
    return { valid: false, message: 'Must specify a card to play' };
  }

  const card = hand.cards.find(
    (c) => c.name.toLowerCase() === cardName.toLowerCase() || c.id === cardName
  );
  if (!card) {
    return { valid: false, message: `Card "${cardName}" not found in hand` };
  }

  if (card.type !== 'spell') {
    return { valid: false, message: `${card.name} is not a spell` };
  }

  const player = state.players.get(playerId)!;
  const cost = (card.properties.cost as number) || 0;
  if ((player.resources.mana || 0) < cost) {
    return { valid: false, message: `Not enough mana (need ${cost}, have ${player.resources.mana})` };
  }

  // Validate target if required
  const spellId = card.id.split('_')[0]; // Get base spell ID
  if (['bolt', 'removal'].includes(spellId) && !action.params.target) {
    return { valid: false, message: `${card.name} requires a target` };
  }

  return { valid: true };
}

/**
 * Validate attack action
 */
function validateAttack(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction,
  rules: GameRules
): ValidationResult {
  if (state.currentPhase !== 'combat') {
    return { valid: false, message: 'Can only attack during combat phase' };
  }

  const battlefield = state.zones.get(`${playerId}:battlefield`);
  if (!battlefield) {
    return { valid: false, message: 'Battlefield not found' };
  }

  const attackerName = action.params.attacker;
  if (!attackerName) {
    return { valid: false, message: 'Must specify an attacker' };
  }

  const attacker = battlefield.cards.find(
    (c) => c.name.toLowerCase() === attackerName.toLowerCase() || c.id === attackerName
  );
  if (!attacker) {
    return { valid: false, message: `Creature "${attackerName}" not found on battlefield` };
  }

  if (attacker.properties.tapped) {
    return { valid: false, message: `${attacker.name} is tapped and cannot attack` };
  }

  if (attacker.properties.summoningSickness) {
    return { valid: false, message: `${attacker.name} has summoning sickness and cannot attack` };
  }

  return { valid: true };
}

/**
 * Execute an action effect
 */
export function executeEffect(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction,
  rules: GameRules
): EffectResult {
  switch (action.type) {
    case 'play_creature':
      return executePlayCreature(state, playerId, action);

    case 'play_spell':
      return executePlaySpell(state, playerId, action);

    case 'attack':
      return executeAttack(state, playerId, action);

    case 'draw':
      return executeDraw(state, playerId);

    case 'pass':
      return { success: true, stateChanges: [], events: [] };

    default:
      return {
        success: false,
        message: `Unknown action: ${action.type}`,
        stateChanges: [],
        events: [],
      };
  }
}

/**
 * Execute play_creature
 */
function executePlayCreature(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction
): EffectResult {
  const hand = state.zones.get(`${playerId}:hand`)!;
  const cardName = action.params.card;

  const card = hand.cards.find(
    (c) => c.name.toLowerCase() === cardName.toLowerCase() || c.id === cardName
  )!;

  const cost = (card.properties.cost as number) || 0;

  const stateChanges: StateChange[] = [
    // Pay mana
    {
      type: 'modify_resource',
      details: {
        playerId,
        resource: 'mana',
        delta: -cost,
      },
    },
    // Move creature to battlefield
    {
      type: 'move_card',
      details: {
        cardId: card.id,
        fromZone: `${playerId}:hand`,
        toZone: `${playerId}:battlefield`,
      },
    },
    // Apply summoning sickness
    {
      type: 'modify_property',
      details: {
        target: card.id,
        targetType: 'card',
        property: 'summoningSickness',
        value: true,
      },
    },
  ];

  const events: GameEventInfo[] = [
    {
      type: 'card_played',
      description: `Played ${card.name} to battlefield (cost ${cost} mana).`,
      player: playerId,
      card: card.name,
    },
  ];

  return {
    success: true,
    message: `Played ${card.name} (${card.properties.power}/${card.properties.toughness}) to battlefield.`,
    stateChanges,
    events,
  };
}

/**
 * Execute play_spell
 */
function executePlaySpell(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction
): EffectResult {
  const hand = state.zones.get(`${playerId}:hand`)!;
  const cardName = action.params.card;

  const card = hand.cards.find(
    (c) => c.name.toLowerCase() === cardName.toLowerCase() || c.id === cardName
  )!;

  const cost = (card.properties.cost as number) || 0;
  const spellId = card.id.split('_')[0];

  const stateChanges: StateChange[] = [
    // Pay mana
    {
      type: 'modify_resource',
      details: {
        playerId,
        resource: 'mana',
        delta: -cost,
      },
    },
  ];

  const events: GameEventInfo[] = [];
  let message = `Cast ${card.name}.`;

  // Resolve spell effect based on spell type
  switch (spellId) {
    case 'bolt': {
      // Lightning Bolt - deal 3 damage
      const target = action.params.target;
      if (target === 'opponent' || target === 'player') {
        // Damage opponent
        const opponentId = Array.from(state.players.keys()).find((p) => p !== playerId)!;
        stateChanges.push({
          type: 'modify_resource',
          details: {
            playerId: opponentId,
            resource: 'life',
            delta: -3,
          },
        });
        message = `Cast ${card.name}, dealt 3 damage to opponent.`;
        events.push({
          type: 'damage',
          description: `${card.name} dealt 3 damage to opponent.`,
          player: playerId,
          target: 'opponent',
          amount: 3,
        });
      } else if (target) {
        // Damage a creature
        const targetCreature = findCreatureByName(state, target);
        if (targetCreature) {
          const currentDamage = (targetCreature.card.properties.damage as number) || 0;
          const toughness = (targetCreature.card.properties.toughness as number) || 1;

          if (currentDamage + 3 >= toughness) {
            // Destroy the creature
            stateChanges.push({
              type: 'move_card',
              details: {
                cardId: targetCreature.card.id,
                fromZone: targetCreature.zoneId,
                toZone: `${targetCreature.zone.owner}:discard`,
              },
            });
            message = `Cast ${card.name}, destroyed ${targetCreature.card.name}.`;
            events.push({
              type: 'destroy',
              description: `${card.name} destroyed ${targetCreature.card.name}.`,
              player: playerId,
              target: targetCreature.card.name,
            });
          } else {
            stateChanges.push({
              type: 'modify_property',
              details: {
                target: targetCreature.card.id,
                targetType: 'card',
                property: 'damage',
                value: currentDamage + 3,
              },
            });
            message = `Cast ${card.name}, dealt 3 damage to ${targetCreature.card.name}.`;
            events.push({
              type: 'damage',
              description: `${card.name} dealt 3 damage to ${targetCreature.card.name}.`,
              player: playerId,
              target: targetCreature.card.name,
              amount: 3,
            });
          }
        }
      }
      break;
    }

    case 'heal': {
      // Healing Light - gain 4 life
      stateChanges.push({
        type: 'modify_resource',
        details: {
          playerId,
          resource: 'life',
          delta: 4,
        },
      });
      message = `Cast ${card.name}, gained 4 life.`;
      events.push({
        type: 'heal',
        description: `${card.name} healed 4 life.`,
        player: playerId,
        amount: 4,
      });
      break;
    }

    case 'draw_spell': {
      // Arcane Insight - draw 2 cards
      const deck = state.zones.get(`${playerId}:deck`);
      if (deck && deck.cards.length > 0) {
        const drawCount = Math.min(2, deck.cards.length);
        for (let i = 0; i < drawCount; i++) {
          stateChanges.push({
            type: 'move_card',
            details: {
              cardId: deck.cards[i].id,
              fromZone: `${playerId}:deck`,
              toZone: `${playerId}:hand`,
            },
          });
        }
        message = `Cast ${card.name}, drew ${drawCount} cards.`;
        events.push({
          type: 'draw',
          description: `${card.name} drew ${drawCount} cards.`,
          player: playerId,
          amount: drawCount,
        });
      }
      break;
    }

    case 'removal': {
      // Destroy - destroy target creature
      const target = action.params.target;
      if (target) {
        const targetCreature = findCreatureByName(state, target);
        if (targetCreature) {
          stateChanges.push({
            type: 'move_card',
            details: {
              cardId: targetCreature.card.id,
              fromZone: targetCreature.zoneId,
              toZone: `${targetCreature.zone.owner}:discard`,
            },
          });
          message = `Cast ${card.name}, destroyed ${targetCreature.card.name}.`;
          events.push({
            type: 'destroy',
            description: `${card.name} destroyed ${targetCreature.card.name}.`,
            player: playerId,
            target: targetCreature.card.name,
          });
        }
      }
      break;
    }

    case 'buff': {
      // Battle Rage - +3/+0 until end of turn
      const target = action.params.target;
      if (target) {
        const targetCreature = findCreatureByName(state, target, playerId);
        if (targetCreature) {
          const currentPower = (targetCreature.card.properties.power as number) || 0;
          stateChanges.push({
            type: 'modify_property',
            details: {
              target: targetCreature.card.id,
              targetType: 'card',
              property: 'power',
              value: currentPower + 3,
            },
          });
          message = `Cast ${card.name}, ${targetCreature.card.name} gets +3/+0.`;
          events.push({
            type: 'buff',
            description: `${card.name} gave ${targetCreature.card.name} +3/+0.`,
            player: playerId,
            target: targetCreature.card.name,
          });
        }
      }
      break;
    }
  }

  // Move spell to discard
  stateChanges.push({
    type: 'move_card',
    details: {
      cardId: card.id,
      fromZone: `${playerId}:hand`,
      toZone: `${playerId}:discard`,
    },
  });

  events.push({
    type: 'card_played',
    description: `Cast ${card.name}.`,
    player: playerId,
    card: card.name,
  });

  return { success: true, message, stateChanges, events };
}

/**
 * Execute attack
 */
function executeAttack(
  state: GameState,
  playerId: PlayerId,
  action: ParsedAction
): EffectResult {
  const battlefield = state.zones.get(`${playerId}:battlefield`)!;
  const attackerName = action.params.attacker;

  const attacker = battlefield.cards.find(
    (c) => c.name.toLowerCase() === attackerName.toLowerCase() || c.id === attackerName
  )!;

  const opponentId = Array.from(state.players.keys()).find((p) => p !== playerId)!;
  const opponentBattlefield = state.zones.get(`${opponentId}:battlefield`);

  const stateChanges: StateChange[] = [];
  const events: GameEventInfo[] = [];

  const attackerPower = (attacker.properties.power as number) || 0;

  // For simplicity, opponent doesn't block (random opponent will rarely block strategically)
  // Deal damage to opponent
  stateChanges.push({
    type: 'modify_resource',
    details: {
      playerId: opponentId,
      resource: 'life',
      delta: -attackerPower,
    },
  });

  // Tap the attacker
  stateChanges.push({
    type: 'modify_property',
    details: {
      target: attacker.id,
      targetType: 'card',
      property: 'tapped',
      value: true,
    },
  });

  events.push({
    type: 'attack',
    description: `${attacker.name} attacked for ${attackerPower} damage!`,
    player: playerId,
    card: attacker.name,
    amount: attackerPower,
  });

  return {
    success: true,
    message: `${attacker.name} dealt ${attackerPower} damage to opponent.`,
    stateChanges,
    events,
  };
}

/**
 * Execute draw
 */
function executeDraw(state: GameState, playerId: PlayerId): EffectResult {
  const deck = state.zones.get(`${playerId}:deck`);

  if (!deck || deck.cards.length === 0) {
    return {
      success: false,
      message: 'Cannot draw - deck is empty!',
      stateChanges: [],
      events: [],
    };
  }

  const card = deck.cards[0];

  return {
    success: true,
    message: `Drew ${card.name}.`,
    stateChanges: [
      {
        type: 'move_card',
        details: {
          cardId: card.id,
          fromZone: `${playerId}:deck`,
          toZone: `${playerId}:hand`,
        },
      },
    ],
    events: [
      {
        type: 'draw',
        description: `Drew ${card.name}.`,
        player: playerId,
        card: card.name,
      },
    ],
  };
}

/**
 * Find a creature by name across all battlefields
 */
function findCreatureByName(
  state: GameState,
  name: string,
  preferOwnerId?: PlayerId
): { card: Card; zone: Zone; zoneId: string } | null {
  // First check preferred owner's battlefield
  if (preferOwnerId) {
    const zone = state.zones.get(`${preferOwnerId}:battlefield`);
    if (zone) {
      const card = zone.cards.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() || c.id === name
      );
      if (card) return { card, zone, zoneId: `${preferOwnerId}:battlefield` };
    }
  }

  // Check all battlefields
  for (const [zoneId, zone] of state.zones) {
    if (zoneId.endsWith(':battlefield')) {
      const card = zone.cards.find(
        (c) => c.name.toLowerCase() === name.toLowerCase() || c.id === name
      );
      if (card) return { card, zone, zoneId };
    }
  }

  return null;
}

/**
 * Get detailed valid actions for a player
 */
export function getValidActionsDetailed(
  state: GameState,
  playerId: PlayerId,
  rules: GameRules
): ActionOption[] {
  const actions: ActionOption[] = [];
  const player = state.players.get(playerId);
  if (!player) return actions;

  const phase = state.currentPhase;
  const mana = player.resources.mana || 0;

  const hand = state.zones.get(`${playerId}:hand`);
  const battlefield = state.zones.get(`${playerId}:battlefield`);
  const opponentId = Array.from(state.players.keys()).find((p) => p !== playerId)!;
  const opponentBattlefield = state.zones.get(`${opponentId}:battlefield`);

  // Always can pass
  actions.push({
    action: 'pass',
    description: `End ${phase} phase`,
    example: 'playtest action pass',
  });

  if (phase === 'main') {
    // Play creature
    const affordableCreatures = hand?.cards
      .filter((c) => c.type === 'creature' && (c.properties.cost as number) <= mana)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        cost: c.properties.cost as number,
        power: c.properties.power as number,
        toughness: c.properties.toughness as number,
      })) || [];

    if (affordableCreatures.length > 0) {
      actions.push({
        action: 'play_creature',
        description: 'Play a creature from hand',
        affordable: affordableCreatures,
        example: `playtest action play_creature card="${affordableCreatures[0].name}"`,
      });
    }

    // Play spell
    const affordableSpells = hand?.cards
      .filter((c) => c.type === 'spell' && (c.properties.cost as number) <= mana)
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        cost: c.properties.cost as number,
        text: c.text,
      })) || [];

    if (affordableSpells.length > 0) {
      const exampleSpell = affordableSpells[0];
      const needsTarget = ['Lightning Bolt', 'Destroy', 'Battle Rage'].includes(exampleSpell.name);
      actions.push({
        action: 'play_spell',
        description: 'Cast a spell',
        affordable: affordableSpells,
        example: needsTarget
          ? `playtest action play_spell card="${exampleSpell.name}" target=opponent`
          : `playtest action play_spell card="${exampleSpell.name}"`,
      });
    }
  }

  if (phase === 'combat') {
    // Attack with ready creatures
    const readyAttackers = battlefield?.cards
      .filter(
        (c) =>
          c.type === 'creature' &&
          !c.properties.tapped &&
          !c.properties.summoningSickness
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        power: c.properties.power as number,
        toughness: c.properties.toughness as number,
      })) || [];

    if (readyAttackers.length > 0) {
      actions.push({
        action: 'attack',
        description: 'Attack with a creature',
        attackers: readyAttackers,
        example: `playtest action attack attacker="${readyAttackers[0].name}"`,
      });
    }
  }

  return actions;
}
