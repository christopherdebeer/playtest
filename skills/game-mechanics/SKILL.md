---
name: game-mechanics
description: Core game rules and mechanics for the Simple Duel card game
---

# Simple Duel - Game Mechanics

A two-player card game where players summon creatures and cast spells to reduce their opponent's life to zero.

## Game Setup

- Each player starts with **20 life** and **1 mana**
- Each player's deck has **30 cards** (shuffled)
- Each player draws **5 cards** as their starting hand
- Player 1 goes first

## Turn Structure

Each turn has four phases:

### 1. Upkeep Phase
- Gain +1 mana (up to maximum 10)
- Draw 1 card from deck
- If deck is empty and must draw, you lose
- Untap all your creatures
- Remove summoning sickness from your creatures

### 2. Main Phase
- Play creatures from hand (costs mana)
- Cast spells from hand (costs mana)
- Can take multiple actions
- Pass to move to combat

### 3. Combat Phase
- Declare attackers (tap attacking creatures)
- Creatures with summoning sickness can't attack
- Creatures that are tapped can't attack
- Unblocked attackers deal damage equal to power to opponent's life

### 4. End Phase
- Discard down to 7 cards if over hand limit
- Any "until end of turn" effects expire
- Turn passes to opponent

## Card Types

### Creatures
- Have **cost** (mana to play), **power** (damage dealt), **toughness** (damage to destroy)
- Enter battlefield with **summoning sickness** (can't attack this turn)
- Become **tapped** when attacking (can't attack again until untapped)
- Go to discard pile when destroyed

### Spells
- Have **cost** (mana to play) and **effect** (what happens)
- Go to discard pile after resolving
- Some require targets

## Card Set: Starter Deck

| Card | Type | Cost | P/T | Effect |
|------|------|------|-----|--------|
| Goblin Grunt | Creature | 1 | 2/1 | - |
| Steadfast Soldier | Creature | 2 | 2/2 | - |
| Armored Knight | Creature | 3 | 3/3 | - |
| Hill Giant | Creature | 4 | 4/3 | - |
| Young Dragon | Creature | 5 | 4/4 | Flying |
| Lightning Bolt | Spell | 1 | - | Deal 3 damage to any target |
| Healing Light | Spell | 2 | - | Gain 4 life |
| Arcane Insight | Spell | 2 | - | Draw 2 cards |
| Destroy | Spell | 3 | - | Destroy target creature |
| Battle Rage | Spell | 2 | - | Target creature gets +3/+0 until end of turn |

## Keywords

- **Flying**: Can only be blocked by creatures with flying
- **Summoning Sickness**: Can't attack the turn a creature enters
- **Tapped**: Turned sideways, can't attack or use tap abilities

## Win Conditions

1. **Opponent's life reaches 0** - You win!
2. **Opponent can't draw** - If opponent must draw but deck is empty, you win!

## Important Rules

### Mana
- Gain 1 mana at start of your turn
- Maximum 10 mana
- Mana resets each turn (doesn't accumulate between turns)

### Combat
- Only untapped creatures without summoning sickness can attack
- Attacking taps the creature
- Combat damage goes directly to opponent's life (no blocking in this version)

### Targeting
- Spells that say "target creature" can target any creature on the battlefield
- Spells that say "any target" can target a player or creature
- Spells with no target just happen

## State Representation

Game state is stored as JSON:

```json
{
  "turn": 3,
  "phase": "main",
  "activePlayer": "player1",
  "status": "playing",
  "players": {
    "player1": {"life": 18, "mana": 3},
    "player2": {"life": 20, "mana": 2}
  },
  "zones": {
    "player1:hand": [
      {"id": "card_1", "name": "Goblin Grunt", "type": "creature", "cost": 1, "power": 2, "toughness": 1}
    ],
    "player1:battlefield": [
      {"id": "card_2", "name": "Steadfast Soldier", "type": "creature", "power": 2, "toughness": 2, "tapped": false, "summoningSickness": false}
    ],
    "player1:deck": [...],
    "player1:discard": [...]
  }
}
```

## Strategic Tips

1. **Curve out**: Play a card every turn using all your mana
2. **Trade up**: Use cheap removal on expensive threats
3. **Card advantage**: Drawing extra cards wins long games
4. **Tempo**: Aggressive early plays pressure the opponent
5. **Removal timing**: Save removal for must-answer threats
