# Player Personas Library

Game-agnostic player personas for playtesting different play styles.

## Overview

Personas modify the base `player.md` agent behavior by adding personality traits, strategic preferences, and behavioral patterns. These are useful for:

- **Testing game balance** - Do certain strategies dominate?
- **Finding exploits** - Will rule-bending players break the game?
- **Validating contest system** - Do strict players catch cheaters?
- **Fun factor assessment** - Is the game enjoyable for casual players?

## Available Personas

| Persona | Risk Level | Strategy | Contest Behavior |
|---------|------------|----------|------------------|
| `casual` | Low | Fun-focused | Rarely contests |
| `strategic` | Medium | Optimal play | Contests clear violations |
| `aggressive` | High | Win at all costs | Contests everything suspicious |
| `rule-lawyer` | Low | By-the-book | Contests any ambiguity |
| `cheater` | High | Bend/break rules | Never contests |
| `chaotic` | Variable | Random/unpredictable | Random contests |

## Persona Files

Each persona is a markdown file that extends the base player template:

```
agents/personas/
├── README.md           # This file
├── casual.md           # Casual/fun player
├── strategic.md        # Optimal strategy player
├── aggressive.md       # Win-focused aggressive player
├── rule-lawyer.md      # Strict rule interpretation
├── cheater.md          # Rule-bending player (for testing)
└── chaotic.md          # Unpredictable random player
```

## Usage

When spawning player agents, append the persona to the prompt:

```javascript
Task({
  subagent_type: "player",
  prompt: `GAME: uno
YOUR ID: player-1
PERSONA: strategic

${await Read('agents/personas/strategic.md')}

Begin playing now.`
});
```

## Design Principles

1. **Game-agnostic** - Personas work with any game, not just specific ones
2. **Behavioral, not mechanical** - Personas describe HOW to play, not specific moves
3. **Testable** - Each persona should produce measurably different behavior
4. **Realistic** - Based on real player archetypes from tabletop gaming
