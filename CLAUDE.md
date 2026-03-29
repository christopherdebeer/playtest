# Playtest

Game-agnostic agentic playtesting framework. Uses parallel Claude agents (gamemaster + players) to playtest board/card games defined in `games/*/RULES.md`.

## Setup

Before using `./playtest` cli or Skill, ensure engine is built:
```
npm install && npm run build
```

### Lean 4 (formal verification layer)

The Lean mechanic algebra lives in `lean/`. To install the toolchain and build:
```
curl -sSf https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
export PATH="$HOME/.elan/bin:$PATH"
cd lean && lake build
```

To build the bridge executable (Lean ↔ TS engine integration):
```
cd lean && lake build lean-game
```

The `lean-game` binary is used by `src/mechanics/lean-verifier.ts` to validate game actions against formally verified rules. Enable per-game with:
```yaml
engine_mechanics:
  lean_verifier: true
```

## Quick Start Skill

```
/playtest markovs-chains 2 # uses skill
```
