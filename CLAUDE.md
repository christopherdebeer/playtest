# Playtest

Game-agnostic agentic playtesting framework. Uses parallel Claude agents (gamemaster + players) to playtest board/card games defined in `games/*/RULES.md`.

## Setup

Before using `./playtest`, ensure engine is built:
```
npm install && npm run build --prefix engine
```

## Quick Start

```
/start-game markovs-chains 2
```
