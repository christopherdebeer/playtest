#!/bin/bash
# Central logging wrapper for hooks and scripts
# Usage: source this file and call log_hook_execution <hook-name> <hook-script>

LOGS_DIR="${LOGS_DIR:-./logs}"

# Ensure log directories exist
mkdir -p "$LOGS_DIR/hooks" "$LOGS_DIR/engine" "$LOGS_DIR/agents"

# Log hook execution with full stdin/stdout/stderr capture
log_hook_execution() {
  local hook_name="$1"
  local hook_script="$2"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local log_file="$LOGS_DIR/hooks/${hook_name}.log"

  # Log start
  {
    echo "=== HOOK START ==="
    echo "Timestamp: $timestamp"
    echo "Hook: $hook_name"
    echo "Script: $hook_script"
    echo "Working Dir: $(pwd)"
    echo "Environment:"
    env | grep -E '(CLAUDE_|GAME|PLAYER)' | sort
    echo ""
    echo "=== STDIN ==="
    cat
    echo ""
    echo "=== EXECUTION ==="
  } >> "$log_file" 2>&1

  # Execute and capture
  local exit_code=0
  bash "$hook_script" 2>&1 | tee -a "$log_file" || exit_code=$?

  # Log end
  {
    echo ""
    echo "=== HOOK END ==="
    echo "Exit Code: $exit_code"
    echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
    echo ""
  } >> "$log_file" 2>&1

  return $exit_code
}

# Log engine command
log_engine_command() {
  local command="$1"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local log_file="$LOGS_DIR/engine/commands.log"

  echo "[${timestamp}] $command" >> "$log_file"
}

# Log agent action
log_agent_action() {
  local agent_id="$1"
  local action="$2"
  local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
  local log_file="$LOGS_DIR/agents/${agent_id}.log"

  echo "[${timestamp}] $action" >> "$log_file"
}
