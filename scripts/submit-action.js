#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Parse command-line arguments in --key=value format
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  args.forEach(arg => {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  });

  return parsed;
}

/**
 * Safely read and parse a JSON file
 */
function readJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

/**
 * Write JSON data to a file, creating directories if needed
 */
function writeJSON(filePath, data) {
  const dir = path.dirname(filePath);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file with pretty formatting
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Validate that action has required structure
 */
function validateAction(actionData) {
  if (!actionData || typeof actionData !== 'object') {
    throw new Error('Action must be a JSON object');
  }

  if (!actionData.type) {
    throw new Error('Action must have a "type" field');
  }

  // Validate known action types
  const validTypes = ['play_card', 'move', 'draw', 'pass'];
  if (!validTypes.includes(actionData.type)) {
    console.warn(`Warning: Unknown action type "${actionData.type}". Valid types: ${validTypes.join(', ')}`);
  }

  return true;
}

/**
 * Main function: Submit player action
 */
async function main() {
  const args = parseArgs();

  // Validate required arguments
  if (!args.player) {
    console.error('Error: Missing required argument --player');
    console.error('Usage: npm run submit-action -- --player=player-1 --game=markovs-chains --action=\'{"type":"play_card","parameters":{...}}\'');
    process.exit(2);
  }

  if (!args.game) {
    console.error('Error: Missing required argument --game');
    console.error('Usage: npm run submit-action -- --player=player-1 --game=markovs-chains --action=\'{"type":"play_card","parameters":{...}}\'');
    process.exit(2);
  }

  if (!args.action) {
    console.error('Error: Missing required argument --action');
    console.error('Usage: npm run submit-action -- --player=player-1 --game=markovs-chains --action=\'{"type":"play_card","parameters":{...}}\'');
    process.exit(2);
  }

  // Parse action JSON
  let actionData;
  try {
    actionData = JSON.parse(args.action);
  } catch (err) {
    console.error('Error: Invalid JSON in --action parameter');
    console.error(`Parse error: ${err.message}`);
    console.error(`Received: ${args.action}`);
    process.exit(1);
  }

  // Validate action structure
  try {
    validateAction(actionData);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  // Read game state to get turnNumber and gameId
  const baseDir = path.join(__dirname, '..', 'games', args.game, 'state');
  const gameStatePath = path.join(baseDir, 'game-state.json');

  const gameState = readJSON(gameStatePath);

  if (!gameState) {
    console.error('Error: Game state file not found');
    console.error(`Tried to read: ${gameStatePath}`);
    process.exit(3);
  }

  // Parse optional alternatives argument
  let alternatives = [];
  if (args.alternatives) {
    try {
      alternatives = JSON.parse(args.alternatives);
      if (!Array.isArray(alternatives)) {
        console.warn('Warning: --alternatives should be a JSON array, ignoring');
        alternatives = [];
      }
    } catch (err) {
      console.warn(`Warning: Could not parse --alternatives: ${err.message}`);
    }
  }

  // Build complete action object matching the player-action schema
  const completeAction = {
    playerId: args.player,
    turnNumber: gameState.turnNumber,
    gameId: gameState.gameId,
    action: actionData,
    reasoning: args.reasoning || '',
    alternativesConsidered: alternatives,
    timestamp: new Date().toISOString()
  };

  // Write action file
  const actionFilePath = path.join(baseDir, 'player-actions', `${args.player}.json`);

  try {
    writeJSON(actionFilePath, completeAction);
  } catch (err) {
    console.error('Error: Unable to write action file');
    console.error(`File path: ${actionFilePath}`);
    console.error(`Error: ${err.message}`);
    process.exit(4);
  }

  // Output success confirmation to stdout
  const result = {
    success: true,
    message: `Action submitted for ${args.player} turn ${gameState.turnNumber}`,
    actionFile: actionFilePath,
    action: completeAction.action
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// Run main and catch any unexpected errors
main().catch(err => {
  console.error('Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(2);
});
