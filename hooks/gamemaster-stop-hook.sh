#!/bin/bash
# Stop hook for gamemaster agent - ensures it waits for next player action
# Also captures debug data and generates analysis when game completes

# Context guards
AGENT_ID="${CLAUDE_AGENT_ID:-unknown}"
TASK_ID="${CLAUDE_TASK_ID:-}"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"

# Debug logging to file (observable by coordinator)
HOOK_LOG="hooks/debug/gamemaster-stop-hook.log"
mkdir -p "$(dirname "$HOOK_LOG")"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] HOOK FIRED: gamemaster-stop-hook.sh | Agent: $AGENT_ID | Task: $TASK_ID" >> "$HOOK_LOG"

# Only run in subagent context (not main session)
if [ -z "$TASK_ID" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SKIP: Main session context" >> "$HOOK_LOG"
  exit 0  # Main session, skip
fi

# Only run for gamemaster agent
if [[ ! "$AGENT_ID" =~ gamemaster ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] SKIP: Not gamemaster ($AGENT_ID)" >> "$HOOK_LOG"
  exit 0  # Not gamemaster, skip
fi

# Game state detection
GAME_NAME="${GAME_NAME:-markovs-chains}"
GAME_STATE_FILE="games/$GAME_NAME/state/game-state.json"
TASK_OUTPUT_DIR="/tmp/claude/-home-user-playtest/tasks"

# Check if game state exists
if [ ! -f "$GAME_STATE_FILE" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ALLOW EXIT: Game state not found" >> "$HOOK_LOG"
  echo "[gamemaster-stop-hook] Game state not found, allowing exit"
  exit 0
fi

# Read game status and ID
GAME_STATUS=$(jq -r '.gameStatus // "in_progress"' "$GAME_STATE_FILE" 2>/dev/null)
GAME_ID=$(jq -r '.gameId // "unknown"' "$GAME_STATE_FILE" 2>/dev/null)
CURRENT_PLAYER=$(jq -r '.currentPlayer' "$GAME_STATE_FILE" 2>/dev/null)
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Game status: $GAME_STATUS | ID: $GAME_ID | Current: $CURRENT_PLAYER" >> "$HOOK_LOG"

if [ "$GAME_STATUS" = "completed" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] ALLOW EXIT: Game completed, capturing debug data" >> "$HOOK_LOG"
  echo "[gamemaster-stop-hook] Game completed - capturing debug data and analysis"

  # ============================================================
  # CAPTURE DEBUG DATA
  # ============================================================

  DEBUG_DIR="games/$GAME_NAME/logs/debug"
  DEBUG_FILE="$DEBUG_DIR/capture-$GAME_ID.json"
  LIVE_LOG="games/$GAME_NAME/logs/game-$GAME_ID-live.jsonl"

  mkdir -p "$DEBUG_DIR"

  # Collect task outputs before they're cleaned up
  TASK_OUTPUTS="[]"
  if [ -d "$TASK_OUTPUT_DIR" ]; then
    for output_file in "$TASK_OUTPUT_DIR"/*.output 2>/dev/null; do
      if [ -f "$output_file" ]; then
        AGENT_FILE_ID=$(basename "$output_file" .output)
        # Get last 100 lines to keep size reasonable
        CONTENT=$(tail -100 "$output_file" 2>/dev/null | jq -Rs '.' 2>/dev/null || echo '""')
        TASK_OUTPUTS=$(echo "$TASK_OUTPUTS" | jq --arg id "$AGENT_FILE_ID" --argjson content "$CONTENT" '. + [{agentId: $id, output: $content}]')
      fi
    done
  fi

  # ============================================================
  # CALCULATE TIMING ANALYSIS
  # ============================================================

  TIMING_ANALYSIS="{}"
  if [ -f "$LIVE_LOG" ]; then
    # Extract timestamps from game log
    GAME_START=$(grep -m1 '"event":"game_start"' "$LIVE_LOG" | jq -r '.timestamp // empty' 2>/dev/null)
    GAME_END=$(grep '"event":"game_end"' "$LIVE_LOG" | jq -r '.timestamp // empty' 2>/dev/null)
    TOTAL_TURNS=$(grep '"event":"game_end"' "$LIVE_LOG" | jq -r '.totalTurns // 0' 2>/dev/null)
    WINNER=$(grep '"event":"game_end"' "$LIVE_LOG" | jq -r '.winner // "none"' 2>/dev/null)

    # Calculate per-turn timings using Python for reliable datetime handling
    TURN_TIMINGS=$(python3 << 'PYEOF'
import json
import sys
from datetime import datetime

def parse_ts(ts):
    if not ts:
        return None
    return datetime.fromisoformat(ts.replace('Z', '+00:00'))

try:
    with open(sys.argv[1] if len(sys.argv) > 1 else 'games/markovs-chains/logs/game-markovs-chains-1769562135-live.jsonl', 'r') as f:
        events = [json.loads(line) for line in f if line.strip()]
except:
    print('[]')
    sys.exit(0)

timings = []
prev_ts = None

for e in events:
    ts_str = e.get('timestamp')
    if not ts_str:
        continue

    ts = parse_ts(ts_str)
    if ts is None:
        continue

    turn_num = e.get('turnNumber', 0)
    player_id = e.get('playerId', 'system')
    action = e.get('action') or e.get('event', 'unknown')

    duration = 0
    if prev_ts:
        duration = (ts - prev_ts).total_seconds()

    timings.append({
        'turn': turn_num,
        'player': player_id,
        'action': action,
        'timestamp': ts_str,
        'durationFromPrev': duration
    })
    prev_ts = ts

print(json.dumps(timings))
PYEOF
    "$LIVE_LOG" 2>/dev/null || echo "[]")

    # Calculate statistics
    STATS=$(python3 << 'PYEOF'
import json
import sys

try:
    timings = json.loads(sys.argv[1])
except:
    print('{}')
    sys.exit(0)

if not timings:
    print('{}')
    sys.exit(0)

# Filter to actual turns (not system events)
turn_times = [t for t in timings if t.get('turn', 0) > 0]

if not turn_times:
    print('{}')
    sys.exit(0)

durations = [t['durationFromPrev'] for t in turn_times]
total = sum(durations)
avg = total / len(durations) if durations else 0
max_dur = max(durations) if durations else 0
min_dur = min(durations) if durations else 0

# Find slowest turn
slowest = max(turn_times, key=lambda x: x['durationFromPrev']) if turn_times else {}

# Per-player stats
player_times = {}
for t in turn_times:
    p = t.get('player', 'unknown')
    if p not in player_times:
        player_times[p] = []
    player_times[p].append(t['durationFromPrev'])

player_stats = {}
for p, times in player_times.items():
    player_stats[p] = {
        'turns': len(times),
        'totalTime': sum(times),
        'avgTime': sum(times) / len(times) if times else 0
    }

print(json.dumps({
    'totalGameTime': total,
    'avgTurnTime': avg,
    'maxTurnTime': max_dur,
    'minTurnTime': min_dur,
    'slowestTurn': slowest,
    'playerStats': player_stats,
    'turnCount': len(turn_times)
}))
PYEOF
    "$TURN_TIMINGS" 2>/dev/null || echo "{}")

    TIMING_ANALYSIS=$(jq -n \
      --arg start "$GAME_START" \
      --arg end "$GAME_END" \
      --arg winner "$WINNER" \
      --argjson turns "$TOTAL_TURNS" \
      --argjson turnTimings "$TURN_TIMINGS" \
      --argjson stats "$STATS" \
      '{
        gameStart: $start,
        gameEnd: $end,
        winner: $winner,
        totalTurns: $turns,
        turnTimings: $turnTimings,
        statistics: $stats
      }')
  fi

  # ============================================================
  # WRITE DEBUG CAPTURE FILE
  # ============================================================

  CAPTURE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  jq -n \
    --arg gameId "$GAME_ID" \
    --arg gameName "$GAME_NAME" \
    --arg sessionId "$SESSION_ID" \
    --arg captureTime "$CAPTURE_TS" \
    --argjson taskOutputs "$TASK_OUTPUTS" \
    --argjson timingAnalysis "$TIMING_ANALYSIS" \
    '{
      gameId: $gameId,
      gameName: $gameName,
      sessionId: $sessionId,
      captureTime: $captureTime,
      taskOutputs: $taskOutputs,
      timingAnalysis: $timingAnalysis
    }' > "$DEBUG_FILE"

  echo "[gamemaster-stop-hook] Debug capture saved to: $DEBUG_FILE"

  # ============================================================
  # APPEND ANALYSIS SUMMARY TO LIVE LOG
  # ============================================================

  if [ -f "$LIVE_LOG" ]; then
    # Extract key stats for log summary
    TOTAL_TIME=$(echo "$STATS" | jq -r '.totalGameTime // 0')
    AVG_TURN=$(echo "$STATS" | jq -r '.avgTurnTime // 0')
    MAX_TURN=$(echo "$STATS" | jq -r '.maxTurnTime // 0')
    SLOWEST_TURN_NUM=$(echo "$STATS" | jq -r '.slowestTurn.turn // 0')
    SLOWEST_PLAYER=$(echo "$STATS" | jq -r '.slowestTurn.player // "unknown"')

    # Append analysis event to log
    jq -n -c \
      --arg ts "$CAPTURE_TS" \
      --argjson totalTime "$TOTAL_TIME" \
      --argjson avgTurn "$AVG_TURN" \
      --argjson maxTurn "$MAX_TURN" \
      --argjson slowestTurn "$SLOWEST_TURN_NUM" \
      --arg slowestPlayer "$SLOWEST_PLAYER" \
      --arg debugFile "$DEBUG_FILE" \
      '{
        event: "analysis_complete",
        timestamp: $ts,
        summary: {
          totalGameTimeSeconds: $totalTime,
          avgTurnTimeSeconds: $avgTurn,
          maxTurnTimeSeconds: $maxTurn,
          slowestTurn: $slowestTurn,
          slowestPlayer: $slowestPlayer
        },
        debugCapture: $debugFile
      }' >> "$LIVE_LOG"

    echo "[gamemaster-stop-hook] Analysis summary appended to: $LIVE_LOG"
  fi

  echo "[gamemaster-stop-hook] Allowing gamemaster to exit"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] EXIT: Debug capture complete" >> "$HOOK_LOG"
  exit 0
fi

# ============================================================
# GAME STILL IN PROGRESS - PROMPT TO WAIT
# ============================================================

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] BLOCKING EXIT: Game in progress, waiting for $CURRENT_PLAYER action" >> "$HOOK_LOG"
echo "========================================" >&2
echo "🚫 STOP HOOK TRIGGERED: Game still active!" >&2
echo "========================================" >&2
echo "[gamemaster-stop-hook] Game in progress - waiting for $CURRENT_PLAYER action"
echo ""
echo "IMPORTANT: Turn signal written, now waiting for player action."
echo "You should continue the turn loop:"
echo "1. Call ./scripts/actions/gamemaster/wait-for-action.sh to BLOCK until player submits action"
echo "2. Process the action according to game rules when it returns"
echo "3. Update game state and signal next turn"
echo "4. Loop back to step 1"
echo ""
echo "Example:"
echo "  result=\$(./scripts/actions/gamemaster/wait-for-action.sh $GAME_NAME)"
echo "  status=\$(echo \"\$result\" | jq -r '.status')"
echo ""

# Return non-zero to indicate gamemaster should continue
exit 1
