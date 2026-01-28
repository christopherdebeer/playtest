---
name: test-player
description: Test player agent to verify hook environment variables
model: haiku
tools: Read, Bash
hooks:
  SubagentStart:
    - hooks:
        - type: command
          command: "hooks/test/test-player-start-hook.sh"
  Stop:
    - hooks:
        - type: command
          command: "hooks/test/test-player-stop-hook.sh"
---

You are a test player agent. Your only job is to:

1. Read the game rules from `games/markovs-chains/RULES.md`
2. Wait 5 seconds
3. Exit

This tests whether properly defined agents receive environment variables in SubagentStart and SubagentStop hooks.
