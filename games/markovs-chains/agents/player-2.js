#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Utility function to read JSON file safely
function readJSONFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

// Utility function to write JSON file
function writeJSONFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
  }
}

// Simulate a sleep/wait function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function playerTurn() {
  const TURN_SIGNAL_PATH = path.join(__dirname, '../state/turn-signal.json');
  const GAME_STATE_PATH = path.join(__dirname, '../state/game-state.json');
  const PLAYER_ACTION_PATH = path.join(__dirname, '../state/player-actions/player-2.json');

  try {
    // Check turn signal
    const turnSignal = readJSONFile(TURN_SIGNAL_PATH);

    if (!turnSignal || turnSignal.currentPlayer !== 'player-2') {
      // Not our turn, or no signal
      return false;
    }

    // Read game state
    const gameState = readJSONFile(GAME_STATE_PATH);
    if (!gameState) {
      console.log('No game state available');
      return false;
    }

    // Extract player and game information
    const myData = gameState.players['player-2'];
    const myHand = myData.hand;
    const myPosition = myData.state;
    const myEffects = myData.activeEffects || [];

    // Collect opponent information
    const opponents = {};
    Object.entries(gameState.players)
      .filter(([playerId]) => playerId !== 'player-2')
      .forEach(([playerId, playerData]) => {
        opponents[playerId] = {
          handSize: playerData.handSize,
          position: playerData.state,
          effects: playerData.activeEffects || []
        };
      });

    // Decision making logic
    const action = {
      playerId: 'player-2',
      turnNumber: turnSignal.turnNumber,
      gameId: turnSignal.gameId,
      action: {},
      reasoning: '',
      alternativesConsidered: [],
      timestamp: new Date().toISOString()
    };

    // Detailed strategy implementation
    if (myPosition === 'Start') {
      // Prioritize advancing from Start
      if (myHand.includes('Catalyst') || myHand.includes('Momentum')) {
        action.action = {
          type: 'play_card',
          parameters: {
            card: myHand.includes('Catalyst') ? 'Catalyst' : 'Momentum',
            target: 'advance'
          }
        };
        action.reasoning = 'Advancing from Start using available boost card';
        action.alternativesConsidered = ['Draw if no good cards'];
      } else {
        action.action = { type: 'draw' };
        action.reasoning = 'No good advancement cards, drawing to improve hand';
      }
    } else if (myPosition === 'A' || myPosition === 'B' || myPosition === 'C') {
      // Check for winning conditions
      if (myHand.includes('Certainty')) {
        action.action = {
          type: 'play_card',
          parameters: {
            card: 'Certainty',
            target: 'Victory'
          }
        };
        action.reasoning = 'Certain path to Victory, playing Certainty';
      } else if (myHand.includes('Momentum')) {
        action.action = {
          type: 'play_card',
          parameters: {
            card: 'Momentum',
            target: 'Victory'
          }
        };
        action.reasoning = 'High probability move to Victory using Momentum';
        action.alternativesConsidered = ['Wait for better odds'];
      } else {
        // Defensive play or interference
        const opponentNearVictory = Object.values(opponents).some(
          opp => ['A', 'B', 'C'].includes(opp.position)
        );

        if (opponentNearVictory && (myHand.includes('Block') || myHand.includes('Friction'))) {
          action.action = {
            type: 'play_card',
            parameters: {
              card: myHand.includes('Block') ? 'Block' : 'Friction',
              target: 'interfere'
            }
          };
          action.reasoning = 'Blocking an opponent near Victory';
        } else {
          action.action = { type: 'draw' };
          action.reasoning = 'No clear advantageous move, drawing to improve hand';
        }
      }
    }

    // Write action to file
    writeJSONFile(PLAYER_ACTION_PATH, action);
    console.log('Player-2 turn completed:', action.reasoning);

    return true;
  } catch (error) {
    console.error('Error in player turn:', error);
    return false;
  }
}

async function gameLoop() {
  console.log('Player-2 agent started');
  while (true) {
    try {
      const gameStatePath = path.join(__dirname, '../state/game-state.json');
      const gameState = readJSONFile(gameStatePath);

      // Check if game is completed
      if (gameState && gameState.gameStatus === 'completed') {
        console.log('Game completed. Player-2 agent exiting.');
        break;
      }

      // Attempt turn
      await playerTurn();

      // Wait before next polling
      await sleep(1000);
    } catch (error) {
      console.error('Game loop error:', error);
      await sleep(1000);
    }
  }
}

gameLoop().catch(console.error);