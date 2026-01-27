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
 * Filter game state for a specific player (information hiding)
 * Removes other players' private data (hands) and returns only public information
 */
function filterStateForPlayer(gameState, turnSignal, playerId) {
  const playerData = gameState.players[playerId];

  if (!playerData) {
    throw new Error(`Player ${playerId} not found in game state`);
  }

  // Build opponents object with PUBLIC data only
  const opponents = {};
  Object.entries(gameState.players).forEach(([pid, pdata]) => {
    if (pid !== playerId) {
      opponents[pid] = {
        position: pdata.state,
        handSize: pdata.handSize,
        effects: pdata.activeEffects || []
      };
    }
  });

  // Return filtered state with only information this player should see
  return {
    turnNumber: gameState.turnNumber,
    gameId: gameState.gameId,
    yourHand: playerData.hand,  // PRIVATE to this player
    yourPosition: playerData.state,
    yourEffects: playerData.activeEffects || [],
    opponents,  // PUBLIC data only (no hands)
    availableActions: turnSignal.availableActions ||
      ["play_card", "move", "draw", "pass"],
    sharedState: {
      deckSize: gameState.deckSize,
      discardPileSize: gameState.discardPile?.length || 0,
      // Include game-specific public data
      ...(gameState.gameSpecific || {})
    },
    gameRules: turnSignal.gameRules || "See game RULES.md for full rules"
  };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function: Poll for turn and output filtered state
 */
async function main() {
  const args = parseArgs();

  // Validate required arguments
  if (!args.player) {
    console.error('Error: Missing required argument --player');
    console.error('Usage: npm run wait-for-turn -- --player=player-1 --game=markovs-chains');
    process.exit(3);
  }

  if (!args.game) {
    console.error('Error: Missing required argument --game');
    console.error('Usage: npm run wait-for-turn -- --player=player-1 --game=markovs-chains');
    process.exit(3);
  }

  // Construct file paths
  const baseDir = path.join(__dirname, '..', 'games', args.game, 'state');
  const turnSignalPath = path.join(baseDir, 'turn-signal.json');
  const gameStatePath = path.join(baseDir, 'game-state.json');

  let attempts = 0;
  const maxAttempts = 120;  // 2 minutes (120 seconds at 1 second per attempt)
  const pollInterval = 1000; // 1 second

  // Polling loop
  while (attempts < maxAttempts) {
    // First, check if game has completed or errored
    const gameState = readJSON(gameStatePath);

    if (gameState) {
      // Check for game completion
      if (gameState.gameStatus === 'completed') {
        console.error('Game completed');
        process.exit(1);
      }

      // Check for game errors
      if (gameState.gameStatus === 'error' || gameState.gameStatus === 'cancelled') {
        console.error(`Game status: ${gameState.gameStatus}`);
        if (gameState.errorMessage) {
          console.error(`Error: ${gameState.errorMessage}`);
        }
        process.exit(2);
      }
    }

    // Check turn signal
    const turnSignal = readJSON(turnSignalPath);

    if (turnSignal && turnSignal.currentPlayer === args.player) {
      // It's our turn!
      if (!gameState) {
        console.error('Error: Turn signal exists but game state file is missing');
        process.exit(2);
      }

      // Filter state and output to stdout
      try {
        const filteredState = filterStateForPlayer(gameState, turnSignal, args.player);
        console.log(JSON.stringify(filteredState, null, 2));
        process.exit(0);
      } catch (err) {
        console.error(`Error filtering state: ${err.message}`);
        process.exit(2);
      }
    }

    // Not our turn yet, wait and try again
    await sleep(pollInterval);
    attempts++;
  }

  // Timeout after max attempts
  console.error(`Timeout: Waited ${maxAttempts} seconds for turn signal`);
  process.exit(4);
}

// Run main and catch any unexpected errors
main().catch(err => {
  console.error('Unexpected error:', err.message);
  console.error(err.stack);
  process.exit(2);
});
