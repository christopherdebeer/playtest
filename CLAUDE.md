# Playtest

Game-agnostic agentic playtesting framework. Uses parallel Claude agents (gamemaster + players) to playtest board/card games defined in `games/*/RULES.md`.

## Setup

Before using `./playtest` cli or Skill, ensure engine is built:
```
npm install && npm run build
```

## Quick Start Skill

```
/playtest markovs-chains 2 # uses skill
```
