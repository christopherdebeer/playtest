/**
 * Rule parser - loads YAML game definitions and converts to GameConfig
 */

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { GameRulesSchema, type GameRules, type CardDef } from './schema.js';
import type {
  GameConfig,
  ZoneDefinition,
  ResourceDefinition,
  TurnStructure,
  ActionDefinition,
  WinCondition,
  ParameterDefinition,
  Card,
} from '../core/types.js';
import { randomUUID } from 'crypto';

/**
 * Load and parse a game rules file
 */
export function loadGameRules(filePath: string): GameRules {
  const content = readFileSync(filePath, 'utf-8');
  return parseGameRules(content);
}

/**
 * Parse game rules from YAML string
 */
export function parseGameRules(yamlContent: string): GameRules {
  const rawRules = parseYaml(yamlContent);
  const result = GameRulesSchema.safeParse(rawRules);

  if (!result.success) {
    const errors = result.error.issues.map(
      (i) => `  - ${i.path.join('.')}: ${i.message}`
    ).join('\n');
    throw new Error(`Invalid game rules:\n${errors}`);
  }

  return result.data;
}

/**
 * Convert parsed rules to GameConfig
 */
export function rulesToConfig(rules: GameRules): GameConfig {
  // Convert zones
  const zones: ZoneDefinition[] = rules.zones.map((z) => ({
    id: z.id,
    perPlayer: z.per_player,
    visibility: z.visibility,
    constraints: {
      maxSize: z.max_size,
      minSize: z.min_size,
      ordered: z.ordered,
      allowedCardTypes: z.allowed_types,
    },
  }));

  // Convert resources
  const resources: ResourceDefinition[] = rules.resources.map((r) => ({
    id: r.id,
    initial: r.initial,
    min: r.min,
    max: r.max,
  }));

  // Convert turn structure
  const turnStructure: TurnStructure = {
    phases: rules.turn_structure.phases,
    actionsPerPhase: rules.turn_structure.actions_per_phase,
  };

  // Convert actions
  const actions: ActionDefinition[] = Object.entries(rules.actions).map(([id, action]) => ({
    id,
    name: action.name || id,
    validWhen: action.valid_when,
    effect: action.effect,
    phases: action.phases,
    params: action.params ? Object.fromEntries(
      Object.entries(action.params).map(([k, v]) => [k, {
        type: v.type,
        required: v.required,
        validation: v.validation,
      }])
    ) : undefined,
  }));

  // Convert win conditions
  const winConditions: WinCondition[] = rules.win_conditions.map((wc, i) => {
    if (typeof wc === 'string') {
      return { id: `win_${i}`, condition: wc };
    }
    return { id: `win_${i}`, condition: wc.condition, priority: wc.priority };
  });

  // Convert parameters
  const parameters: ParameterDefinition[] = Object.entries(rules.parameters).map(([id, p]) => ({
    id,
    type: p.type,
    default: p.default,
    min: p.min,
    max: p.max,
    choices: p.choices,
    description: p.description,
  }));

  return {
    name: rules.game.name,
    version: rules.game.version,
    playerCount: rules.game.players,
    zones,
    resources,
    turnStructure,
    actions,
    winConditions,
    parameters,
  };
}

/**
 * Generate card instances from card definitions
 */
export function generateCards(rules: GameRules): Card[] {
  const cards: Card[] = [];

  // Collect all card definitions
  const allCardDefs: CardDef[] = [];

  if (rules.cards) {
    allCardDefs.push(...rules.cards);
  }

  if (rules.card_sets) {
    for (const cardSet of Object.values(rules.card_sets)) {
      allCardDefs.push(...cardSet);
    }
  }

  // Generate card instances
  for (const cardDef of allCardDefs) {
    for (let i = 0; i < cardDef.count; i++) {
      cards.push({
        id: `${cardDef.id}_${randomUUID().slice(0, 8)}`,
        name: cardDef.name,
        type: cardDef.type,
        properties: { ...cardDef.properties },
        text: cardDef.text,
      });
    }
  }

  return cards;
}

/**
 * Apply parameters to rules (for exploration)
 */
export function applyParameters(
  rules: GameRules,
  params: Record<string, unknown>
): GameRules {
  // Deep clone rules
  const newRules = JSON.parse(JSON.stringify(rules)) as GameRules;

  // Replace parameter references in rules
  const replaceParams = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      // Replace ${param_name} patterns
      return obj.replace(/\$\{(\w+)\}/g, (_, name) => {
        if (name in params) {
          return String(params[name]);
        }
        if (name in (rules.parameters || {})) {
          return String(rules.parameters[name].default);
        }
        return `\${${name}}`;
      });
    }
    if (Array.isArray(obj)) {
      return obj.map(replaceParams);
    }
    if (obj && typeof obj === 'object') {
      return Object.fromEntries(
        Object.entries(obj).map(([k, v]) => [k, replaceParams(v)])
      );
    }
    return obj;
  };

  return replaceParams(newRules) as GameRules;
}

/**
 * Get parameter space for exploration
 */
export function getParameterSpace(rules: GameRules): Map<string, unknown[]> {
  const space = new Map<string, unknown[]>();

  for (const [id, param] of Object.entries(rules.parameters)) {
    if (param.type === 'number' && param.min !== undefined && param.max !== undefined) {
      const step = param.step || 1;
      const values: number[] = [];
      for (let v = param.min; v <= param.max; v += step) {
        values.push(v);
      }
      space.set(id, values);
    } else if (param.type === 'boolean') {
      space.set(id, [true, false]);
    } else if (param.type === 'choice' && param.choices) {
      space.set(id, param.choices);
    }
  }

  return space;
}

/**
 * Validate rules for common issues
 */
export function validateRules(rules: GameRules): string[] {
  const issues: string[] = [];

  // Check that referenced zones exist
  const zoneIds = new Set(rules.zones.map((z) => z.id));

  for (const [actionId, action] of Object.entries(rules.actions)) {
    if (action.params) {
      for (const [paramId, param] of Object.entries(action.params)) {
        if (param.from_zone && !zoneIds.has(param.from_zone)) {
          issues.push(`Action '${actionId}' param '${paramId}' references unknown zone '${param.from_zone}'`);
        }
      }
    }
    if (action.phases) {
      for (const phase of action.phases) {
        if (!rules.turn_structure.phases.includes(phase)) {
          issues.push(`Action '${actionId}' references unknown phase '${phase}'`);
        }
      }
    }
  }

  // Check that at least one win condition exists
  if (rules.win_conditions.length === 0) {
    issues.push('No win conditions defined');
  }

  // Check for required actions
  if (Object.keys(rules.actions).length === 0) {
    issues.push('No actions defined');
  }

  return issues;
}

/**
 * Format rules as readable document (for LLM context)
 */
export function formatRulesForLLM(rules: GameRules): string {
  const lines: string[] = [];

  lines.push(`# ${rules.game.name} (v${rules.game.version})`);
  if (rules.game.description) {
    lines.push('');
    lines.push(rules.game.description);
  }
  lines.push('');

  lines.push('## Players');
  lines.push(`${rules.game.players.min}-${rules.game.players.max} players`);
  lines.push('');

  lines.push('## Zones');
  for (const zone of rules.zones) {
    const perPlayer = zone.per_player ? ' (per player)' : '';
    lines.push(`- **${zone.id}**${perPlayer}: ${zone.visibility}`);
  }
  lines.push('');

  if (rules.resources.length > 0) {
    lines.push('## Resources');
    for (const res of rules.resources) {
      lines.push(`- **${res.id}**: starts at ${res.initial}${res.per_turn ? `, +${res.per_turn}/turn` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Turn Structure');
  lines.push(`Phases: ${rules.turn_structure.phases.join(' → ')}`);
  lines.push('');

  lines.push('## Actions');
  for (const [id, action] of Object.entries(rules.actions)) {
    lines.push(`### ${action.name || id}`);
    lines.push(`**When valid:** ${action.valid_when}`);
    lines.push(`**Effect:** ${action.effect}`);
    if (action.params) {
      lines.push('**Parameters:**');
      for (const [pid, param] of Object.entries(action.params)) {
        lines.push(`  - ${pid}: ${param.type}${param.required ? ' (required)' : ''}`);
      }
    }
    lines.push('');
  }

  lines.push('## Win Conditions');
  for (const wc of rules.win_conditions) {
    const condition = typeof wc === 'string' ? wc : wc.condition;
    lines.push(`- ${condition}`);
  }
  lines.push('');

  if (rules.rules_text) {
    lines.push('## Additional Rules');
    lines.push(rules.rules_text);
    lines.push('');
  }

  if (rules.keywords && Object.keys(rules.keywords).length > 0) {
    lines.push('## Keywords');
    for (const [kw, meaning] of Object.entries(rules.keywords)) {
      lines.push(`- **${kw}**: ${meaning}`);
    }
  }

  return lines.join('\n');
}
