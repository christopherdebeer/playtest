# Quick Start - Agent Hook Testing

## Validate Setup (Optional)

```bash
./validate-test-setup.sh
```

Should show: ✅ ALL CHECKS PASSED

## Run Test

### 1. Restart Claude Code
```bash
# Exit current session, then:
claude
```

### 2. Verify Agents Loaded
```
/agents
```

Look for: `test-player`, `gamemaster`, `player`

### 3. Run Test Agent
```
Use the test-player subagent to verify hook environment variables
```

### 4. Check Results
```bash
cat hooks/test/test-player-stop-hook.log | grep "CLAUDE_"
```

**Success** = See actual values (not "NOT_SET")
**Failure** = See "NOT_SET" for all variables

## Full Details

See `TESTING-AGENT-HOOKS.md` for complete context and next steps.
