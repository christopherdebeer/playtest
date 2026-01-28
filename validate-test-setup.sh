#!/bin/bash
# Quick validation that test setup is ready

echo "🔍 Validating Agent Hook Test Setup..."
echo ""

ERRORS=0

# Check agent files exist
if [ ! -f ".claude/agents/test-player.md" ]; then
    echo "❌ Missing: .claude/agents/test-player.md"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Found: .claude/agents/test-player.md"
fi

if [ ! -f ".claude/agents/gamemaster.md" ]; then
    echo "❌ Missing: .claude/agents/gamemaster.md"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Found: .claude/agents/gamemaster.md"
fi

if [ ! -f ".claude/agents/player.md" ]; then
    echo "❌ Missing: .claude/agents/player.md"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Found: .claude/agents/player.md"
fi

# Check hook script exists and is executable
if [ ! -f "hooks/test/test-player-stop-hook.sh" ]; then
    echo "❌ Missing: hooks/test/test-player-stop-hook.sh"
    ERRORS=$((ERRORS + 1))
elif [ ! -x "hooks/test/test-player-stop-hook.sh" ]; then
    echo "❌ Not executable: hooks/test/test-player-stop-hook.sh"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Found and executable: hooks/test/test-player-stop-hook.sh"
fi

# Check test-player has Stop hook defined
if grep -q "hooks:" .claude/agents/test-player.md && grep -q "Stop:" .claude/agents/test-player.md; then
    echo "✅ test-player has Stop hook defined in frontmatter"
else
    echo "❌ test-player missing Stop hook in frontmatter"
    ERRORS=$((ERRORS + 1))
fi

# Check game rules exist (needed for test)
if [ ! -f "games/markovs-chains/RULES.md" ]; then
    echo "❌ Missing: games/markovs-chains/RULES.md"
    ERRORS=$((ERRORS + 1))
else
    echo "✅ Found: games/markovs-chains/RULES.md"
fi

echo ""
echo "════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "✅ ALL CHECKS PASSED - Ready to test!"
    echo ""
    echo "Next steps:"
    echo "1. Restart Claude Code session"
    echo "2. Run: Use the test-player subagent"
    echo "3. Check: cat hooks/test/test-player-stop-hook.log"
    echo ""
    echo "See TESTING-AGENT-HOOKS.md for details"
    exit 0
else
    echo "❌ FAILED: $ERRORS errors found"
    echo ""
    echo "Fix errors and run this script again"
    exit 1
fi
