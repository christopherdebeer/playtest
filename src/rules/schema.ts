/**
 * Zod schema for game rule definitions
 * Provides runtime validation of YAML rule files
 */

import { z } from 'zod';

// Zone definition schema
export const ZoneDefSchema = z.object({
  id: z.string(),
  per_player: z.boolean().default(false),
  visibility: z.enum(['public', 'private', 'hidden']).default('public'),
  max_size: z.number().optional(),
  min_size: z.number().optional(),
  ordered: z.boolean().default(true),
  allowed_types: z.array(z.string()).optional(),
});

// Resource definition schema
export const ResourceDefSchema = z.object({
  id: z.string(),
  initial: z.number().default(0),
  min: z.number().optional(),
  max: z.number().optional(),
  per_turn: z.number().optional(),  // Amount gained per turn
});

// Card definition schema
export const CardDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  count: z.number().default(1),  // How many copies in the deck
  properties: z.record(z.unknown()).default({}),
  text: z.string().optional(),  // Effect text for arbiter
  keywords: z.array(z.string()).optional(),
});

// Parameter definition for exploration
export const ParameterDefSchema = z.object({
  type: z.enum(['number', 'boolean', 'choice']).default('number'),
  default: z.unknown(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  choices: z.array(z.unknown()).optional(),
  description: z.string().optional(),
});

// Action parameter schema
export const ActionParamSchema = z.object({
  type: z.enum(['card', 'zone', 'player', 'number', 'choice']),
  required: z.boolean().default(true),
  validation: z.string().optional(),
  from_zone: z.string().optional(),  // For card type, which zone to select from
  choices: z.array(z.unknown()).optional(),
});

// Action definition schema
export const ActionDefSchema = z.object({
  name: z.string().optional(),
  valid_when: z.string(),  // Condition - can be expression or natural language
  effect: z.string(),      // Effect - supports natural language for arbiter
  params: z.record(ActionParamSchema).optional(),
  phases: z.array(z.string()).optional(),  // Phases when this action is available
});

// Win condition schema
export const WinConditionSchema = z.object({
  condition: z.string(),
  priority: z.number().default(0),
  message: z.string().optional(),
});

// Turn structure schema
export const TurnStructureSchema = z.object({
  phases: z.array(z.string()),
  actions_per_phase: z.record(z.array(z.string())).optional(),
  auto_advance: z.boolean().default(true),
});

// Setup instruction schema - base types without recursion
const BaseSetupInstructionSchema = z.union([
  z.object({ shuffle: z.string() }),
  z.object({ draw: z.number(), from: z.string().optional(), to: z.string().optional() }),
  z.object({ set: z.record(z.number()) }),
  z.object({ create_deck: z.object({ zone: z.string(), cards: z.string() }) }),
  z.object({ custom: z.string() }),  // Natural language for arbiter
]);

type BaseSetupInstruction = z.infer<typeof BaseSetupInstructionSchema>;
type SetupInstructionType = BaseSetupInstruction | { each_player: SetupInstructionType[] };

// Setup instruction schema with recursion
export const SetupInstructionSchema: z.ZodType<SetupInstructionType> = z.union([
  BaseSetupInstructionSchema,
  z.object({ each_player: z.array(z.lazy((): z.ZodType<SetupInstructionType> => SetupInstructionSchema)) }),
]);

// Complete game rules schema
export const GameRulesSchema = z.object({
  game: z.object({
    name: z.string(),
    version: z.string().default('1.0'),
    description: z.string().optional(),
    players: z.object({
      min: z.number().default(2),
      max: z.number().default(2),
    }).default({ min: 2, max: 2 }),
  }),

  zones: z.array(ZoneDefSchema).default([
    { id: 'deck', per_player: true, visibility: 'hidden' },
    { id: 'hand', per_player: true, visibility: 'private' },
    { id: 'discard', per_player: true, visibility: 'public' },
  ]),

  resources: z.array(ResourceDefSchema).default([]),

  cards: z.array(CardDefSchema).optional(),
  card_sets: z.record(z.array(CardDefSchema)).optional(),

  turn_structure: TurnStructureSchema.default({
    phases: ['main'],
    auto_advance: true,
  }),

  setup: z.array(SetupInstructionSchema).default([]),

  actions: z.record(ActionDefSchema),

  win_conditions: z.array(
    z.union([z.string(), WinConditionSchema])
  ).default([]),

  parameters: z.record(ParameterDefSchema).default({}),

  // Natural language rules for complex mechanics
  rules_text: z.string().optional(),

  // Keywords and their meanings
  keywords: z.record(z.string()).optional(),
});

export type GameRules = z.infer<typeof GameRulesSchema>;
export type ZoneDef = z.infer<typeof ZoneDefSchema>;
export type ResourceDef = z.infer<typeof ResourceDefSchema>;
export type CardDef = z.infer<typeof CardDefSchema>;
export type ActionDef = z.infer<typeof ActionDefSchema>;
export type SetupInstruction = z.infer<typeof SetupInstructionSchema>;
