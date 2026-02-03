#!/usr/bin/env npx tsx
/**
 * Generate shared/registered-mechanics.json from the mechanic registry
 *
 * This script reads all registered mechanics from the runtime registry
 * and generates a JSON file that can be used by the site generator and
 * other tools to understand what mechanics are available.
 *
 * Run: npx tsx scripts/generate-mechanics-registry.ts
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import the mechanics system (this registers all mechanics)
import '../src/mechanics/index.js';
import { getRegisteredMechanicsMetadata } from '../src/mechanics/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, '..', 'shared', 'registered-mechanics.json');

interface RegistryOutput {
  _comment: string;
  version: string;
  generated: string;
  generatedBy: string;
  mechanics: Record<string, MechanicEntry>;
  partial: Record<string, PartialEntry>;
}

interface MechanicEntry {
  config_key: string;
  since: string;
  description?: string;
  config_schema?: Record<string, unknown>;
  hooks: string[];
  dependencies?: string[];
  conflicts?: string[];
}

interface PartialEntry {
  notes: string;
  related_config?: string;
}

function main() {
  console.log('Generating registered-mechanics.json from mechanic registry...');

  const mechanics = getRegisteredMechanicsMetadata();
  console.log(`Found ${mechanics.length} registered mechanics`);

  // Build the output structure
  const output: RegistryOutput = {
    _comment: 'Auto-generated from mechanic registry. Do not edit manually. Run: npm run generate:mechanics',
    version: '4.0.0',
    generated: new Date().toISOString(),
    generatedBy: 'scripts/generate-mechanics-registry.ts',
    mechanics: {},
    partial: {
      // Partial implementations are still manually maintained
      'hidden-roles': {
        notes: 'Basic role assignment works, but role revelation and special win conditions need GM adjudication',
        related_config: 'objectives, victory_declaration'
      },
      'traitor-game': {
        notes: 'Supported via hidden-roles, but traitor mechanics require GM interpretation',
        related_config: 'hidden-roles, victory_declaration'
      }
    }
  };

  // Convert mechanic metadata to registry format
  for (const mechanic of mechanics) {
    // Convert configSchema to simplified schema format
    let configSchemaSimple: Record<string, unknown> | undefined;
    if (mechanic.configSchema) {
      if (mechanic.configSchema.type === 'boolean') {
        configSchemaSimple = { enabled: 'boolean' };
      } else if (mechanic.configSchema.properties) {
        configSchemaSimple = {};
        for (const [key, prop] of Object.entries(mechanic.configSchema.properties as Record<string, { type: string; enum?: unknown[] }>)) {
          if (prop.enum) {
            configSchemaSimple[key] = prop.enum.join(' | ');
          } else {
            configSchemaSimple[key] = prop.type;
          }
        }
      }
    }

    output.mechanics[mechanic.slug] = {
      config_key: mechanic.configKey,
      since: '3.0.0', // All current mechanics are from version 3.0.0
      description: mechanic.description,
      config_schema: configSchemaSimple,
      hooks: mechanic.hooks,
      ...(mechanic.dependencies?.length ? { dependencies: mechanic.dependencies } : {}),
      ...(mechanic.conflicts?.length ? { conflicts: mechanic.conflicts } : {})
    };
  }

  // Write the output file
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${OUTPUT_FILE}`);

  // Print summary
  console.log('\nRegistered mechanics:');
  for (const mechanic of mechanics) {
    const hooks = mechanic.hooks.length > 0 ? ` (${mechanic.hooks.length} hooks)` : '';
    console.log(`  - ${mechanic.slug}: ${mechanic.name}${hooks}`);
  }
}

main();
