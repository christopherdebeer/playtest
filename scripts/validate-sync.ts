#!/usr/bin/env npx ts-node
/**
 * Build-time validation script to ensure types stay in sync across:
 * - shared/types/log-events.ts (canonical log event definitions)
 * - shared/mechanics-implementation.json (mechanics implementation mapping)
 * - engine/src/types.ts (EngineMechanics interface)
 * - mechanics/index.json (mechanics library)
 * - site/src/types/logs.ts (site log types - should import from shared)
 *
 * Run: npx ts-node scripts/validate-sync.ts
 * Add to CI/build: npm run validate-sync
 */

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============ LOG EVENT VALIDATION ============

function validateLogEventSync(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read shared log events
  const sharedPath = path.join(ROOT, 'shared/types/log-events.ts');
  if (!fs.existsSync(sharedPath)) {
    errors.push(`Missing shared log events file: ${sharedPath}`);
    return { valid: false, errors, warnings };
  }

  const sharedContent = fs.readFileSync(sharedPath, 'utf-8');

  // Extract event types from shared file
  const eventTypesMatch = sharedContent.match(/LOG_EVENT_TYPES\s*=\s*\[([\s\S]*?)\]\s*as\s*const/);
  if (!eventTypesMatch) {
    errors.push('Could not parse LOG_EVENT_TYPES from shared/types/log-events.ts');
    return { valid: false, errors, warnings };
  }

  const sharedEventTypes = eventTypesMatch[1]
    .split('\n')
    .map((line: string) => line.match(/'([^']+)'/)?.[1])
    .filter((t: string | undefined): t is string => !!t);

  console.log(`Found ${sharedEventTypes.length} event types in shared definitions`);

  // Check site types file references shared
  const siteTypesPath = path.join(ROOT, 'site/src/types/logs.ts');
  if (fs.existsSync(siteTypesPath)) {
    const siteContent = fs.readFileSync(siteTypesPath, 'utf-8');

    // Check if site imports from shared (future state) or has duplicate definitions (current state)
    if (!siteContent.includes('from \'../../../shared/types/log-events\'') &&
        !siteContent.includes('from "@playtest/shared"')) {
      warnings.push(
        'site/src/types/logs.ts does not import from shared types. ' +
        'Consider setting up npm workspaces for proper type sharing.'
      );

      // Validate that site has all the event types defined
      for (const eventType of sharedEventTypes) {
        const eventPattern = new RegExp(`event:\\s*['"]${eventType}['"]`);
        if (!eventPattern.test(siteContent)) {
          errors.push(`Site types missing event type: ${eventType}`);
        }
      }
    }
  }

  // Check engine types
  const engineTypesPath = path.join(ROOT, 'engine/src/types.ts');
  if (fs.existsSync(engineTypesPath)) {
    const engineContent = fs.readFileSync(engineTypesPath, 'utf-8');

    // Check for LogEvent interface
    if (!engineContent.includes('interface LogEvent')) {
      warnings.push('Engine types.ts missing LogEvent interface');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============ MECHANICS IMPLEMENTATION VALIDATION ============

interface MechanicsIndex {
  mechanics: Array<{ slug: string; name: string; category: string }>;
}

interface MechanicsImplementation {
  implemented: Record<string, { config_key: string; since: string; description: string }>;
  partial: Record<string, { notes: string; related_config: string }>;
}

function validateMechanicsSync(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Read mechanics index
  const indexPath = path.join(ROOT, 'mechanics/index.json');
  if (!fs.existsSync(indexPath)) {
    errors.push(`Missing mechanics index: ${indexPath}`);
    return { valid: false, errors, warnings };
  }

  const index: MechanicsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const librarySlugs = new Set(index.mechanics.map(m => m.slug));

  console.log(`Found ${librarySlugs.size} mechanics in library`);

  // Read implementation mapping
  const implPath = path.join(ROOT, 'shared/mechanics-implementation.json');
  if (!fs.existsSync(implPath)) {
    errors.push(`Missing mechanics implementation mapping: ${implPath}`);
    return { valid: false, errors, warnings };
  }

  const impl: MechanicsImplementation = JSON.parse(fs.readFileSync(implPath, 'utf-8'));

  // Validate implemented mechanics exist in library
  for (const slug of Object.keys(impl.implemented)) {
    if (!librarySlugs.has(slug)) {
      errors.push(`Implemented mechanic "${slug}" not found in mechanics library`);
    }
  }

  // Validate partial mechanics exist in library
  for (const slug of Object.keys(impl.partial)) {
    if (!librarySlugs.has(slug)) {
      errors.push(`Partial mechanic "${slug}" not found in mechanics library`);
    }
  }

  // Read engine types to validate config keys exist
  const engineTypesPath = path.join(ROOT, 'engine/src/types.ts');
  if (fs.existsSync(engineTypesPath)) {
    const engineContent = fs.readFileSync(engineTypesPath, 'utf-8');

    // Extract EngineMechanics interface fields
    const mechanicsMatch = engineContent.match(/interface EngineMechanics\s*\{([\s\S]*?)\n\}/);
    if (mechanicsMatch) {
      const mechanicsContent = mechanicsMatch[1];

      for (const [slug, info] of Object.entries(impl.implemented)) {
        const configKey = info.config_key;
        // Check if config key exists in EngineMechanics
        const keyPattern = new RegExp(`\\b${configKey}\\??\\s*:`);
        if (!keyPattern.test(mechanicsContent)) {
          errors.push(
            `Mechanic "${slug}" claims config_key "${configKey}" but it's not in EngineMechanics interface`
          );
        }
      }
    }
  }

  const implementedCount = Object.keys(impl.implemented).length;
  const partialCount = Object.keys(impl.partial).length;
  const notImplemented = librarySlugs.size - implementedCount - partialCount;

  console.log(`Implementation status: ${implementedCount} implemented, ${partialCount} partial, ${notImplemented} not implemented`);

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============ GAME STATE IN LOGS VALIDATION ============

function validateLogStateTracking(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const sharedPath = path.join(ROOT, 'shared/types/log-events.ts');
  if (fs.existsSync(sharedPath)) {
    const content = fs.readFileSync(sharedPath, 'utf-8');

    // Check if action_executed includes state snapshot
    if (!content.includes('state_snapshot') && !content.includes('stateSnapshot')) {
      warnings.push(
        'Log events do not include game state snapshots. ' +
        'Consider adding state_before/state_after to action_executed events for debugging.'
      );
    }

    // Check if reasoning is part of action data
    if (content.includes('reasoning?:')) {
      console.log('✓ Action reasoning field exists (optional)');
    } else if (!content.includes('reasoning:')) {
      warnings.push(
        'Action events have optional reasoning. Consider making it required for better playtest analysis.'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============ MAIN ============

async function main() {
  console.log('=== Playtest Sync Validation ===\n');

  let allValid = true;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate log events
  console.log('--- Log Event Types ---');
  const logResult = validateLogEventSync();
  allValid = allValid && logResult.valid;
  allErrors.push(...logResult.errors);
  allWarnings.push(...logResult.warnings);

  console.log('');

  // Validate mechanics
  console.log('--- Mechanics Implementation ---');
  const mechResult = validateMechanicsSync();
  allValid = allValid && mechResult.valid;
  allErrors.push(...mechResult.errors);
  allWarnings.push(...mechResult.warnings);

  console.log('');

  // Validate state tracking
  console.log('--- Log State Tracking ---');
  const stateResult = validateLogStateTracking();
  allValid = allValid && stateResult.valid;
  allErrors.push(...stateResult.errors);
  allWarnings.push(...stateResult.warnings);

  console.log('\n=== Results ===\n');

  if (allWarnings.length > 0) {
    console.log('Warnings:');
    for (const warning of allWarnings) {
      console.log(`  ⚠️  ${warning}`);
    }
    console.log('');
  }

  if (allErrors.length > 0) {
    console.log('Errors:');
    for (const error of allErrors) {
      console.log(`  ❌ ${error}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('✅ All validations passed\n');
}

main().catch(err => {
  console.error('Validation failed:', err);
  process.exit(1);
});
