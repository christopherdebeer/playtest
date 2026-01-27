#!/bin/bash
set -e

# Ensure Python 3 is used
PYTHON_CMD=$(command -v python3 || command -v python)

# Change to the game directory
cd "$(dirname "$0")/../.."

# Run the player-1 agent
"$PYTHON_CMD" games/markovs-chains/agents/player-1.py