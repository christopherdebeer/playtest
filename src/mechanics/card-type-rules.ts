/**
 * Card Type Rules Mechanic
 *
 * Controls which card types can be played and how.
 * Supports playable restrictions (e.g., items can't be played, only held).
 *
 * Type rules come from config?.engine_mechanics?.card_type_rules?.type_rules if configured;
 * falls back to checking card flags (placeable_as_location, etc.) as defaults.
 *
 * Hooks used:
 * - preValidateAction: Block play_card if card type is not playable
 */

import { MechanicHooks, HookContext, ValidationResult } from './types.js';
import { GameAction, PlayCardAction, Card } from '../types/game.js';

interface CardTypeRule {
  playable?: boolean;
}

interface CardTypeRulesConfig {
  type_rules?: Record<string, CardTypeRule>;
}

export const cardTypeRulesMechanic: MechanicHooks = {
  slug: 'card-type-rules',
  name: 'Card Type Rules',
  requires: ['cards'],

  preValidateAction(ctx: HookContext, action: GameAction): ValidationResult | null {
    // Only validate play_card actions
    if (action.type !== 'play_card') return null;

    const playAction = action as PlayCardAction;
    const card = (ctx.player.hand ?? []).find((c: Card) => c.name === playAction.card);

    // Card not found - let core validation handle this
    if (!card) return null;

    // Read type rules from config if available
    const engineMechanics = ctx.config.engine_mechanics as Record<string, unknown> | undefined;
    const cardTypeRulesConfig = engineMechanics?.card_type_rules as CardTypeRulesConfig | undefined;

    // Use config-driven type_rules if configured
    if (cardTypeRulesConfig?.type_rules) {
      const rules = cardTypeRulesConfig.type_rules[card.type];
      if (!rules) return null;

      if (rules.playable === false) {
        // Use placeable_as_location flag for location-specific hint
        const hint = card.placeable_as_location
          ? ' Use a place_location or move action instead.'
          : card.type === 'item' ? ' Items are held in hand until used or traded.' : '';
        return {
          valid: false,
          error: `Cannot play "${card.name}". Cards of type "${card.type}" cannot be played.${hint}`
        };
      }

      return { valid: true };
    }

    // Fall back to legacy config path for backward compatibility
    const legacyCardTypeRules = engineMechanics?.card_type_rules as Record<string, CardTypeRule> | undefined;
    if (!legacyCardTypeRules || cardTypeRulesConfig?.type_rules !== undefined) return null;

    // If it's a flat map (old format), use it directly
    const flatRules = legacyCardTypeRules as Record<string, CardTypeRule>;
    const rules = flatRules[card.type];
    if (!rules) return null;

    if (rules.playable === false) {
      const hint = card.placeable_as_location
        ? ' Use a place_location or move action instead.'
        : card.type === 'item' ? ' Items are held in hand until used or traded.' : '';
      return {
        valid: false,
        error: `Cannot play "${card.name}". Cards of type "${card.type}" cannot be played.${hint}`
      };
    }

    return { valid: true };
  }
};
