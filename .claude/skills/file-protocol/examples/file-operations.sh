#!/usr/bin/env bash
# File Operations for Multi-Agent Coordination
# Demonstrates atomic writes, locking, and safe file operations

set -euo pipefail

# Configuration
STATE_DIR="games/uno/state"
LOCK_DIR="${STATE_DIR}/.locks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# LOCKING OPERATIONS
# ============================================================================

# Acquire lock with timeout
# Usage: acquire_lock <resource_name> <timeout_seconds>
acquire_lock() {
    local resource=$1
    local timeout=${2:-10}
    local lock_path="${LOCK_DIR}/${resource}.lock"
    local start_time=$(date +%s)

    log_info "Acquiring lock for ${resource}..."

    while ! mkdir "$lock_path" 2>/dev/null; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $timeout ]; then
            log_error "Lock timeout after ${timeout}s"
            return 1
        fi

        sleep 0.1
    done

    # Write PID for debugging
    echo $$ > "${lock_path}/owner"
    log_info "Lock acquired by PID $$"
    return 0
}

# Release lock
# Usage: release_lock <resource_name>
release_lock() {
    local resource=$1
    local lock_path="${LOCK_DIR}/${resource}.lock"

    if [ ! -d "$lock_path" ]; then
        log_warn "Lock ${resource} not found"
        return 1
    fi

    rm -f "${lock_path}/owner"
    rmdir "$lock_path"
    log_info "Lock released for ${resource}"
    return 0
}

# Clean stale locks (older than threshold)
# Usage: clean_stale_locks <max_age_seconds>
clean_stale_locks() {
    local max_age=${1:-30}

    if [ ! -d "$LOCK_DIR" ]; then
        return 0
    fi

    for lock in "$LOCK_DIR"/*.lock; do
        if [ ! -d "$lock" ]; then
            continue
        fi

        local lock_time=$(stat -f%m "$lock" 2>/dev/null || stat -c%Y "$lock" 2>/dev/null)
        local current_time=$(date +%s)
        local age=$((current_time - lock_time))

        if [ $age -gt $max_age ]; then
            log_warn "Removing stale lock: $(basename $lock) (age: ${age}s)"
            rm -rf "$lock"
        fi
    done
}

# ============================================================================
# ATOMIC WRITE OPERATIONS
# ============================================================================

# Atomic write to JSON file
# Usage: atomic_write <file_path> <json_content>
atomic_write() {
    local file_path=$1
    local content=$2
    local tmp_file="${file_path}.tmp.$$"

    # Write to temporary file
    echo "$content" > "$tmp_file"

    # Validate JSON
    if ! jq empty "$tmp_file" 2>/dev/null; then
        log_error "Invalid JSON, aborting write"
        rm -f "$tmp_file"
        return 1
    fi

    # Atomic move
    mv "$tmp_file" "$file_path"
    log_info "Atomically written to ${file_path}"
    return 0
}

# Read-modify-write with locking
# Usage: safe_update <file_path> <resource_name> <jq_filter>
safe_update() {
    local file_path=$1
    local resource=$2
    local jq_filter=$3

    # Acquire lock
    if ! acquire_lock "$resource"; then
        return 1
    fi

    # Read current state
    if [ ! -f "$file_path" ]; then
        log_error "File not found: ${file_path}"
        release_lock "$resource"
        return 1
    fi

    local current_state=$(cat "$file_path")

    # Apply modification
    local new_state=$(echo "$current_state" | jq "$jq_filter")

    # Atomic write
    if ! atomic_write "$file_path" "$new_state"; then
        release_lock "$resource"
        return 1
    fi

    # Release lock
    release_lock "$resource"
    return 0
}

# ============================================================================
# GAME-SPECIFIC OPERATIONS
# ============================================================================

# Write turn signal
# Usage: write_turn_signal <player_id> <turn_number>
write_turn_signal() {
    local player_id=$1
    local turn_number=$2
    local file_path="${STATE_DIR}/turn-signal.json"

    local signal=$(cat <<EOF
{
  "fileType": "turn-signal",
  "version": "1.0",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "turnNumber": ${turn_number},
  "currentPlayer": "${player_id}",
  "availableActions": ["play", "draw"]
}
EOF
)

    atomic_write "$file_path" "$signal"
}

# Write player action
# Usage: write_player_action <player_id> <turn_number> <action> <card_json>
write_player_action() {
    local player_id=$1
    local turn_number=$2
    local action=$3
    local card=${4:-null}

    mkdir -p "${STATE_DIR}/player-actions"
    local file_path="${STATE_DIR}/player-actions/${player_id}.json"

    local action_data=$(cat <<EOF
{
  "fileType": "player-action",
  "version": "1.0",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "playerId": "${player_id}",
  "turnNumber": ${turn_number},
  "action": "${action}",
  "card": ${card}
}
EOF
)

    atomic_write "$file_path" "$action_data"
}

# Update game state (with locking)
# Usage: update_game_state <jq_filter>
update_game_state() {
    local jq_filter=$1
    local file_path="${STATE_DIR}/game-state.json"

    safe_update "$file_path" "game-state" "$jq_filter"
}

# ============================================================================
# FILE MONITORING
# ============================================================================

# Wait for file to appear
# Usage: wait_for_file <file_path> <timeout_seconds>
wait_for_file() {
    local file_path=$1
    local timeout=${2:-30}
    local start_time=$(date +%s)

    log_info "Waiting for ${file_path}..."

    while [ ! -f "$file_path" ]; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $timeout ]; then
            log_error "Timeout waiting for ${file_path}"
            return 1
        fi

        sleep 0.5
    done

    log_info "File appeared: ${file_path}"
    return 0
}

# Watch directory for changes
# Usage: watch_directory <directory_path>
watch_directory() {
    local dir_path=$1

    log_info "Watching ${dir_path} for changes..."

    # Different implementations for macOS vs Linux
    if command -v fswatch &> /dev/null; then
        # macOS with fswatch
        fswatch -0 "$dir_path" | while read -d "" event; do
            log_info "Change detected: $event"
        done
    else
        # Fallback: polling
        local last_mod=$(stat -c%Y "$dir_path" 2>/dev/null || stat -f%m "$dir_path")

        while true; do
            local current_mod=$(stat -c%Y "$dir_path" 2>/dev/null || stat -f%m "$dir_path")

            if [ "$current_mod" != "$last_mod" ]; then
                log_info "Change detected in ${dir_path}"
                last_mod=$current_mod
            fi

            sleep 1
        done
    fi
}

# ============================================================================
# EXAMPLE USAGE
# ============================================================================

example_usage() {
    log_info "=== File Operations Examples ==="

    # Setup
    mkdir -p "$STATE_DIR" "$LOCK_DIR" "${STATE_DIR}/player-actions"

    # Example 1: Atomic write
    log_info "\n--- Example 1: Atomic Write ---"
    atomic_write "${STATE_DIR}/test.json" '{"test": true, "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}'

    # Example 2: Lock acquire/release
    log_info "\n--- Example 2: Locking ---"
    if acquire_lock "test-resource" 5; then
        log_info "Performing critical operation..."
        sleep 2
        release_lock "test-resource"
    fi

    # Example 3: Turn signal
    log_info "\n--- Example 3: Turn Signal ---"
    write_turn_signal "player-1" 1

    # Example 4: Player action
    log_info "\n--- Example 4: Player Action ---"
    write_player_action "player-1" 1 "play" '{"color": "Red", "value": "7"}'

    # Example 5: Update game state
    log_info "\n--- Example 5: Update Game State ---"
    # Initialize game state first
    atomic_write "${STATE_DIR}/game-state.json" '{"turnNumber": 1, "currentPlayer": "player-1"}'
    # Update it
    update_game_state '.turnNumber += 1 | .currentPlayer = "player-2"'

    # Example 6: Stale lock cleanup
    log_info "\n--- Example 6: Clean Stale Locks ---"
    clean_stale_locks 30

    log_info "\n=== Examples Complete ==="
}

# Run examples if script is executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    example_usage
fi
