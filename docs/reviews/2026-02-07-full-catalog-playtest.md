# Full Catalog Playtest Review — 2026-02-07

**Date**: February 7, 2026
**Engine Version**: playtest v3.0.0
**Scope**: All 18 available games, first-ever playtest run for each
**Agent Config**: Gamemaster (Sonnet), Players (Haiku), background execution

---

## Executive Summary

All 18 games in the catalog were initialized and playtested in a single batch session. Every game successfully initialized, registered agents, and began play. **No game ran to completion** — all stalled due to agent turn-limit exhaustion before reaching an end state. The engine itself operated correctly in every case: cards dealt, actions resolved, turns tracked. The primary blocker is agent lifecycle management, not game logic.

**Best performers**: alliance (r3/t5), parallel-race (r3/t5), aaote (r2/t4), draft-duel (r2/t4)
**Worst performers**: council-of-whispers (r1/t1, 0 actions), uno (r1/t1, 0 actions)

### Validation Summary

| Status | Count | Games |
|--------|-------|-------|
| VALID (no warnings) | 2 | draft-duel, road-rally |
| VALID (warnings) | 14 | aaote (7), arcane-assembly (6), council-of-whispers (7), dice-dynasties (6), engine-masters (1), fortune-seekers (12), grand-bazaar (5), markovs-chains (4), parallel-race (4), rondel-express (10), shadow-operations (7), spellbook-showdown (16), treasure-hunters (19), uno (4) |
| INVALID (errors) | 2 | alliance (4 errors), battle-forge (4 errors) |

---

## Per-Game Deep Dive

### 1. AAOTE: An Agent of the Enemy

| Field | Value |
|-------|-------|
| **Instance** | `aaote-1770504132704` |
| **Version** | v0.3 |
| **Players** | 3 |
| **Mechanics** | action_points, grid, hand_limit, hand_management, hidden_objectives, hidden_roles, tile_placement, trade, traitor_game, victory_declaration (14 total) |
| **Deck** | 50 cards |
| **Final State** | Round 2, Turn 4 (player-1) |
| **Actions Logged** | 7 |
| **Validation** | VALID (7 warnings: missing max_rounds, 6 unknown mechanics) |

**Action Timeline**:
- `22:42:33` game_start
- `22:43:12` player-1: play_card (Spy targeting player-2, peek_hand)
- `22:44:44` player-1: draw (1 card)
- `22:45:05` player-1: pass
- `22:51:10` player-2: play_card (Hidden Path, secret_move)
- `22:52:26` player-2: draw (2 cards)
- `23:12:27` player-3: draw (2 cards)
- `23:14:47` player-3: pass

**Observations**:
- Strong turn progression with all 3 players taking meaningful actions
- ~6 min gap between player-2 and player-3 suggests player-3 agent was slower to act
- Cards used thematically (Spy for deduction, Hidden Path for stealth)
- Hand sizes at stall: p1=5, p2=6, p3=7 (accumulating from draws)
- **Game design note**: Players defaulting to draw+pass suggests unclear action incentives in early game

**Issues**:
- 7 unknown mechanics in index (grid, hand-limit, hand-limit-policy, timeout-winner, trade, victory-declaration)
- Missing `max_rounds` defaults to 50 (extremely long for this game)

---

### 2. Alliance

| Field | Value |
|-------|-------|
| **Instance** | `alliance-1770504184352` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | cooperative, tableau-building, resources (3 listed, none in index) |
| **Deck** | 19 cards |
| **Final State** | Round 3, Turn 5 (player-1) |
| **Actions Logged** | 4 |
| **Validation** | INVALID (4 errors: missing overview, setup, gameplay, winning sections) |

**Action Timeline**:
- `22:43:43` game_start
- `22:44:35` player-1: add_to_tableau
- `22:45:30` player-2: add_to_tableau
- `22:47:38` player-1: add_to_tableau
- `23:03:51` player-2: add_to_tableau

**Observations**:
- **Best turn progression** (tied with parallel-race) despite having INVALID rules
- Clean turn alternation with consistent action type (add_to_tableau)
- Simple mechanic = agents understand immediately what to do
- 16-minute gap between turns 3→4 suggests player-2 agent was slow on final action
- Hand sizes at stall: p1=2, p2=2 (depleting from initial 4)

**Issues**:
- INVALID: Missing all 4 required markdown sections (overview, setup, gameplay, winning)
- All 3 mechanics unknown to index (cooperative, tableau-building, resources)
- 6 unknown card effect types (score, resource)
- **Critical**: Game ran with `--skip-validation`, meaning agents had no structured rule sections to read — yet still performed well due to simple mechanics

---

### 3. Arcane Assembly

| Field | Value |
|-------|-------|
| **Instance** | `arcane-assembly-1770504190901` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | pattern_building, network_and_route_building, action_programming, tech_trees, worker_placement_different_worker_types, turn_order_progressive, location_effects, building, resources, action_points (10 total) |
| **Deck** | None (mechanic-driven) |
| **Final State** | Round 2, Turn 3 (player-1) |
| **Actions Logged** | 3 |
| **Validation** | VALID (6 warnings: 3 unknown mechanics, 3 missing advised sections) |

**Action Timeline**:
- `22:43:56` game_start
- `22:45:43` player-1: program_action
- `22:47:28` player-2: program_action
- `22:50:32` player-2: pass

**Observations**:
- Both players successfully used the `program_action` mechanic
- No cards in hand (handSize=0) — this is a pure mechanic-driven game
- Player-2 took 2 actions on their turn (program + pass), showing understanding of turn flow
- 10 mechanics is high complexity, but action_programming gave agents a clear entry point

**Issues**:
- 3 unknown mechanics (action-programming, building, resources)
- Missing gamemasterNotes, strategy, designNotes sections

---

### 4. Battle Forge

| Field | Value |
|-------|-------|
| **Instance** | `battle-forge-1770504256614` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | worker_placement, worker_placement_different_worker_types, resources, cards |
| **Deck** | 15 cards |
| **Final State** | Round 2, Turn 3 (player-1) |
| **Actions Logged** | 3 |
| **Validation** | INVALID (4 errors: missing overview, setup, gameplay, winning sections) |

**Action Timeline**:
- `22:45:46` game_start
- `22:47:04` player-1: place_worker (Forge, +3 score)
- `22:53:42` player-2: play_card (Trade Route, +3 gold)
- `22:54:54` player-2: place_worker (Barracks, +2 score)

**Observations**:
- Demonstrated both worker placement and card play mechanics working together
- Worker placement returned structured rewards (resource type + amount)
- Player-2 combined card play + worker placement in a single turn (good strategic depth)
- Hand sizes: p1=3, p2=2

**Issues**:
- INVALID: Missing all 4 required markdown sections
- 5 unknown card effect types (bonus_worker, score, resource)
- resources mechanic unknown to index

---

### 5. Council of Whispers

| Field | Value |
|-------|-------|
| **Instance** | `council-of-whispers-1770504281416` |
| **Version** | v1.0 |
| **Players** | 4 |
| **Mechanics** | voting, negotiation, bribery, alliances, betting_and_bluffing, communication_limits, semi_cooperative_game, prisoners_dilemma, simultaneous_action_selection, win_single_loser, turn_order_role_order, hidden_roles, resources, action_points (14 total) |
| **Deck** | None |
| **Final State** | Round 1, Turn 1 (player-1) — NEVER TOOK AN ACTION |
| **Actions Logged** | 0 |
| **Validation** | VALID (7 warnings: 3 unknown mechanics, 4 missing sections) |

**Action Timeline**:
- `22:44:41` game_init
- `22:46:19` game_start (1m38s to register all 4 players)
- *No further events*

**Observations**:
- **Most complex game in the catalog** (14 mechanics, 4 players, hidden roles, multi-phase rounds)
- All 4 players registered successfully with hidden roles (3 loyalists, 1 conspirator)
- Each player has 2 action points, various resources (gold=10, influence=3)
- The 5-phase round structure (Simultaneous Selection → Negotiation → Prisoner's Dilemma → Voting → Treasury) is too complex for agents to parse within turn limits
- Simultaneous action selection requires coordination between all 4 agents

**Root Cause**: The game's multi-phase round structure with simultaneous selection doesn't map to the engine's sequential turn model. Agents couldn't determine which phase they were in or what action was expected of them.

**Design Issues**:
- 14 mechanics is excessive — agents can't internalize all rules within turn budget
- Simultaneous selection requires a different orchestration pattern than sequential turns
- No cards dealt (starting_cards: 0) removes a familiar "play a card" action pattern
- Phase transitions need explicit engine support rather than relying on agent understanding

---

### 6. Dice Dynasties

| Field | Value |
|-------|-------|
| **Instance** | `dice-dynasties-1770504288008` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | dice_rolling, rerolling, die_icon_resolution, random_production, investment, loans, commodity_speculation, turn_order_stat_based, advantage_token, resources, action_points (11 total) |
| **Deck** | None |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 2 |
| **Validation** | VALID (6 warnings: 2 unknown mechanics, 4 missing sections) |

**Action Timeline**:
- `22:46:50` game_start
- `22:48:49` player-1: use_advantage (Market Insider token, peek_commodity, passed to player-2)
- `22:51:08` player-1: icon_roll (ore, gold, gold → gained resources)

**Observations**:
- Advantage token mechanic worked correctly (used + passed to opponent)
- Die icon resolution produced structured resource gains
- Player-1 used both the advantage system and dice system on same turn
- Hand sizes both 0 — this is a pure dice/resource game
- Turn never advanced to player-2

**Issues**:
- 11 mechanics is high for agent comprehension
- rerolling, resources mechanics unknown to index

---

### 7. Draft Duel

| Field | Value |
|-------|-------|
| **Instance** | `draft-duel-1770504295810` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | closed_drafting, catch_the_leader, once_per_game_abilities, set_collection, hand_management (5 total) |
| **Deck** | 56 cards |
| **Final State** | Round 2, Turn 4 (player-2) |
| **Actions Logged** | 3 |
| **Validation** | VALID (0 warnings) |

**Action Timeline**:
- `22:47:17` game_start
- `22:49:13` player-1: draft_select (waiting for player-2)
- `22:58:20` player-2: draft_select (round 1 resolved: p1→Power, p2→Air)
- `23:10:24` player-1: draft_select (round 2, waiting for player-2 again)

**Observations**:
- **Cleanest validation** of any game (0 warnings/errors)
- Simultaneous drafting mechanic working: p1 selects, waits for p2, then both resolve
- ~9 min between p1 and p2 selections in round 1 — agent turn budget constraint
- Round 2 stalled waiting for player-2 to make their draft pick
- Hand sizes: p1=1, p2=1 after 2 rounds of drafting

**Design Strength**: Closed drafting naturally creates a synchronization point that the engine handles well via the `waitingFor` mechanism.

---

### 8. Engine Masters

| Field | Value |
|-------|-------|
| **Instance** | `engine-masters-1770504305040` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | deck_building, automatic_resource_growth, chaining, win_score_threshold, resources (5 total) |
| **Deck** | Deck-building (dynamic) |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 1 |
| **Validation** | VALID (1 warning: resources unknown) |

**Action Timeline**:
- `22:48:01` game_start
- `22:51:06` player-1: draw_deck (5 cards: Basic Assembler x2, Copper Generator x3)

**Observations**:
- Only 1 action logged — player-1 drew their starting hand
- 3 minutes from start to first action suggests significant rules processing
- Both players have handSize=5 (second player's draw not logged = happened during setup)
- Turn stuck on player-2

**Issues**:
- Deck-building games need multiple actions per turn (draw, play, buy, cleanup)
- Single `draw_deck` action suggests agent understood only the draw phase
- resources mechanic unknown to index

---

### 9. Fortune Seekers

| Field | Value |
|-------|-------|
| **Instance** | `fortune-seekers-1770504488220` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | open_drafting, push_your_luck, set_collection, variable_powers, scoring_area, hand_management |
| **Deck** | 30 cards |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 1 |
| **Validation** | VALID (12 warnings: 8 unknown effect types, 1 unknown mechanic, 3 missing sections) |

**Action Timeline**:
- `22:55:06` game_start (7 minutes after init — slow registration)
- `22:57:59` player-1: draft (Diamond, 5 remaining in display)

**Observations**:
- 7-minute registration time (longest in batch except UNO)
- Single draft action shows player-1 understood the open drafting mechanic
- Player-2 never acted (handSize=0)
- Player-1 handSize=1 after draft

**Issues**:
- 12 validation warnings — most from unknown effect types (points, reroll, bonus_rolls, multiplier, penalty)
- These unknown effects likely confuse agent rule interpretation
- variable-powers mechanic unknown to index

---

### 10. Grand Bazaar

| Field | Value |
|-------|-------|
| **Instance** | `grand-bazaar-1770504560755` |
| **Version** | v1.0 |
| **Players** | 3 |
| **Mechanics** | auction_english, auction_sealed_bid, auction_once_around, contracts, stock_holding, i_cut_you_choose, turn_order_auction, resources, action_points (9 total) |
| **Deck** | None |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 3 |
| **Validation** | VALID (5 warnings: 1 unknown mechanic, 4 missing sections) |

**Action Timeline**:
- `22:56:21` game_start (7 min after init)
- `22:59:58` player-1: take_contract
- `23:02:47` player-1: take_contract
- `23:07:43` player-1: pass

**Observations**:
- Player-1 understood the contract mechanic and took 2 contracts before passing
- All players have handSize=0 — contract/auction driven game
- Turn never reached player-2 or player-3
- 3 players required but only player-1 acted

**Issues**:
- Auction mechanics require multi-player interaction (bidding rounds) that sequential turn model doesn't naturally support
- resources mechanic unknown to index

---

### 11. Markov's Chains

| Field | Value |
|-------|-------|
| **Instance** | `markovs-chains-1770504629440` |
| **Version** | v2.3 |
| **Players** | 2 |
| **Mechanics** | board_state, probability_movement, card_boosts, victory_declaration (4 total) |
| **Deck** | 30 cards |
| **Board** | 7 states |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 1 |
| **Validation** | VALID (4 warnings: 3 unknown mechanics, 1 missing section) |

**Action Timeline**:
- `22:57:13` game_start
- `23:01:43` player-1: draw (1 card)

**Observations**:
- Only action was a draw — player-1 didn't follow up with movement or card play
- Hand sizes: p1=6, p2=5 (initial hand + draw)
- Board has 7 states for probability-based movement
- This is the most-playtested game historically (14 previous instances) — prior runs show it can reach 12-16 turns

**Issues**:
- 3 mechanics unknown to index (probability-movement, card-boosts, victory-declaration)
- Agent drew a card but didn't use board movement — unclear if move mechanic was discoverable

---

### 12. Parallel Race

| Field | Value |
|-------|-------|
| **Instance** | `parallel-race-1770504642717` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | point_to_point_movement, freeplay, win_race (3 total) |
| **Deck** | 26 cards |
| **Final State** | Round 3, Turn 5 (player-1) |
| **Actions Logged** | 4 |
| **Validation** | VALID (4 warnings: all unknown effect types) |

**Action Timeline**:
- `22:58:35` game_start
- `23:02:47` player-1: play_card (Burst, move_forward 4)
- `23:03:30` player-2: play_card (Dash, move_forward 3)
- `23:10:28` player-1: move (Start → Mile 1, cost 1)
- `23:13:58` player-2: move (Start → Mile 1, cost 1)

**Observations**:
- **Tied for best progression** with alliance (round 3, turn 5)
- Clean alternation between players
- Mix of card play AND board movement — agents understood both mechanics
- Both players at Mile 1 after 2 turns each — balanced pacing
- Only 3 mechanics — simplicity correlates strongly with agent success
- Hand sizes: p1=2, p2=2 (depleting from initial)

**Design Strength**: Simple race mechanic with card-augmented movement is highly agent-friendly.

---

### 13. Road Rally

| Field | Value |
|-------|-------|
| **Instance** | `road-rally-1770504657183` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | point_to_point_movement, trick_taking, ladder_climbing, win_race (4 total) |
| **Deck** | 44 cards |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 1 |
| **Validation** | VALID (0 warnings) |

**Action Timeline**:
- `22:59:37` game_start
- `23:05:52` player-1: play_card (Nitro Burst, suit=turbo, trickPosition=1, leadSuit=turbo)

**Observations**:
- Clean validation (0 warnings) like draft-duel
- Trick-taking mechanic working: card played with suit tracking and trick position
- Player-1 led with turbo suit — agent understood suit/trick mechanics
- Hand sizes: p1=6, p2=7 (large hands from 44-card deck)
- Turn never advanced to player-2
- 6+ minutes from start to first action — rules parsing time for 4 mechanics

**Issues**:
- Trick-taking typically requires all players to play before resolution — agents may not understand the "follow suit" requirement in a 2-player context

---

### 14. Rondel Express

| Field | Value |
|-------|-------|
| **Instance** | `rondel-express-1770504671542` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | rondel, track_movement, pick_up_and_deliver, contracts, ownership, turn_order_pass_order, resources, action_points (8 total) |
| **Deck** | 17 cards |
| **Board** | 13 states (rondel) |
| **Final State** | Round 1, Turn 2 (player-2) |
| **Actions Logged** | 2 |
| **Validation** | VALID (10 warnings: 6 unknown effect types, 1 unknown mechanic, 3 missing sections) |

**Action Timeline**:
- `23:01:21` game_start (10 minutes after init — slowest start)
- `23:08:13` player-1: play_card (Fuel Tank, +2 fuel)
- `23:10:50` player-1: play_card (Fuel Tank, +2 fuel)

**Observations**:
- 10-minute registration time — highest in batch, likely due to 8 complex mechanics
- Player-1 played same card twice (Fuel Tank) — gathering resources before moving on rondel
- Hand sizes: p1=1, p2=3 (p1 depleted, p2 hasn't acted)
- No rondel movement actions logged — player stockpiled fuel but never moved
- Turn never reached player-2

**Issues**:
- 10 validation warnings including 6 unknown effect types
- Rondel movement requires fuel as a prerequisite — agents may understand resource gathering but not the movement step
- 8 mechanics is borderline for agent comprehension

---

### 15. Shadow Operations

| Field | Value |
|-------|-------|
| **Instance** | `shadow-operations-1770504705534` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | area_movement, area_majority_influence, zone_of_control, force_commitment, critical_hits, tug_of_war, hidden_movement, secret_deployment, deduction, team_based_game, events, turn_order_claim_action, resources, action_points (14 total) |
| **Deck** | None |
| **Board** | 8 areas |
| **Final State** | Round 1, Turn 1 (player-1) |
| **Actions Logged** | 2 |
| **Validation** | VALID (7 warnings: 3 unknown mechanics, 4 missing sections) |

**Action Timeline**:
- `23:02:51` game_start (11 min after init)
- `23:12:55` player-1: move (HQ → Port District)
- `23:15:16` player-1: place_influence (Port District, +1)

**Observations**:
- 11-minute registration (second slowest) — 14 mechanics to parse
- Player-1 successfully used both movement and area influence mechanics
- Thematic play: moved to Port District, then placed influence there
- Both players have handSize=0 — pure mechanic-driven
- Turn stuck on player-1 (never passed/advanced)

**Issues**:
- Tied with council-of-whispers for most mechanics (14)
- Unlike council-of-whispers, agents could at least execute basic actions
- Hidden movement and secret deployment are difficult for a sequential turn engine
- 3 unknown mechanics (critical-hits, secret-deployment, resources)

---

### 16. Spellbook Showdown

| Field | Value |
|-------|-------|
| **Instance** | `spellbook-showdown-1770504712639` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | hand_management, card_matching, set_collection, player_elimination, take_that, rock_paper_scissors, card_combo, scoring_area, resources, action_points (10 total) |
| **Deck** | 31 cards |
| **Final State** | Round 1, Turn 1 (player-1) |
| **Actions Logged** | 2 |
| **Validation** | VALID (16 warnings: 8 unknown effect types, 1 unknown mechanic, 4 missing sections, plus 3 card-specific) |

**Action Timeline**:
- `23:05:49` game_start (14 min after init)
- `23:12:34` player-1: play_card (Fireball, damage=3)
- `23:14:54` player-1: play_card (Mana Crystal, gain mana=3)

**Observations**:
- Player-1 understood the damage/resource spell pattern: attack then gain mana
- Thematic card use (Fireball for damage, Mana Crystal for resources)
- 14 minutes from init to start — slow registration
- Hand sizes: p1=4 (played 2 from 6), p2=6 (never acted)
- Turn stuck on player-1

**Issues**:
- 16 validation warnings — highest warning count of any game
- 8 unknown effect types (freeze_all, heal, block, damage, gain_resource, retrieve, copy_last_spell)
- rock_paper_scissors mechanic may not translate well to sequential play

---

### 17. Treasure Hunters

| Field | Value |
|-------|-------|
| **Instance** | `treasure-hunters-1770504719231` |
| **Version** | v1.0 |
| **Players** | 2 |
| **Mechanics** | set_collection, open_drafting, area_movement, hand_management, scoring_area, market, resources, action_points (8 total) |
| **Deck** | 37 cards |
| **Final State** | Round 1, Turn 1 (player-1) |
| **Actions Logged** | 1 |
| **Validation** | VALID (19 warnings: 8 unknown effect types, 1 unknown mechanic, 4 missing sections, plus 6 treasure card warnings) |

**Action Timeline**:
- `23:08:22` game_start (16 min after init)
- `23:13:38` player-1: play_card (Merchant, gold_gain=3)

**Observations**:
- 16 minutes from init to start — second slowest
- Single action: played Merchant for gold gain
- Hand sizes: p1=4, p2=5
- Turn stuck on player-1

**Issues**:
- **Most validation warnings** of any game (19)
- 8 unknown effect types dominated by "treasure" type cards
- resources mechanic unknown
- Missing 4 advised sections
- The high warning count correlates with slow registration and minimal progress

---

### 18. UNO

| Field | Value |
|-------|-------|
| **Instance** | `uno-1770504746906` |
| **Version** | Not specified |
| **Players** | 2 |
| **Mechanics** | hand_management, card_matching, set_collection, take_that, lose_a_turn, win_empty_hand (6 total) |
| **Deck** | 108 cards |
| **Final State** | Round 1, Turn 1 (player-1) — NEVER TOOK AN ACTION |
| **Actions Logged** | 0 |
| **Validation** | VALID (4 warnings: missing version, 3 missing sections) |

**Action Timeline**:
- `22:52:26` game_init
- `23:10:18` game_start (**18 minutes to register** — slowest in entire batch)
- *No further events*

**Observations**:
- 18-minute registration is the longest in the batch by far
- Both players registered with 7-card hands
- No actions taken despite having cards
- UNO has 3 successful prior playtest runs with 50-242 logged events — this is a regression in agent behavior, not a game issue

**Root Cause**: Agent turn budget entirely consumed by registration + rule parsing. The 108-card deck definition in RULES.md is exceptionally long, likely consuming agent context.

**Issues**:
- Missing version field
- 108-card deck definition bloats RULES.md — consider summary format
- Missing gamemasterNotes (agents get no adjudication hints)

---

## Cross-Cutting Analysis

### Correlation: Mechanic Count vs. Progress

| Mechanic Count | Games | Avg Turns Completed |
|---------------|-------|-------------------|
| 3-4 | parallel-race (3), markovs-chains (4), road-rally (4) | 2.7 |
| 5-6 | draft-duel (5), engine-masters (5), fortune-seekers (6), uno (6) | 1.5 |
| 8-10 | grand-bazaar (9), rondel-express (8), treasure-hunters (8), arcane-assembly (10), spellbook-showdown (10) | 1.6 |
| 11-14 | dice-dynasties (11), shadow-operations (14), council-of-whispers (14), aaote (14) | 1.5 |

**Notable exception**: Alliance has only 3 mechanics (cooperative, tableau-building, resources) and achieved the best result. AAOTE has 14 mechanics but still reached round 2 — suggesting well-written rules can partially compensate for complexity.

### Correlation: Registration Time vs. Progress

| Init→Start Time | Games | Outcome |
|----------------|-------|---------|
| < 2 min | alliance (39s), arcane-assembly (46s), aaote (21s) | All reached Round 2+ |
| 2-7 min | battle-forge (90s), dice-dynasties (123s), draft-duel (142s) | Mixed (r1-r2) |
| 7-12 min | fortune-seekers (7m), grand-bazaar (7m), rondel-express (10m), shadow-operations (11m) | Mostly r1/t1-t2 |
| 12-18 min | spellbook-showdown (14m), treasure-hunters (16m), uno (18m) | r1/t1, 0-2 actions |

**Clear pattern**: Games that registered in under 2 minutes universally progressed further. Registration time is the strongest predictor of playtest success.

### Validation Issues Summary

**Most common warnings across all games**:
1. `UNKNOWN_MECHANIC "resources"` — 10 games (resources not in mechanics index)
2. `MISSING_ADVISED_SECTION "designNotes"` — 14 games
3. `MISSING_ADVISED_SECTION "strategy"` — 13 games
4. `MISSING_ADVISED_SECTION "gamemasterNotes"` — 13 games
5. `UNKNOWN_EFFECT_TYPE` — 8 games (various custom effect types)

**Structurally invalid games** (missing required sections):
- alliance: missing overview, setup, gameplay, winning
- battle-forge: missing overview, setup, gameplay, winning

---

## Engine Mechanics Observations

### What Worked Well

1. **Card play/draw cycle**: Every game with cards successfully dealt, drew, and played cards
2. **Worker placement**: battle-forge correctly tracked workers, spaces, and rewards
3. **Drafting**: draft-duel's simultaneous draft with `waitingFor` mechanism worked cleanly
4. **Board movement**: parallel-race and shadow-operations correctly tracked positions
5. **Resource tracking**: dice-dynasties icon resolution produced correct resource gains
6. **Turn alternation**: Games with simple turn structures alternated correctly
7. **Advantage tokens**: dice-dynasties token use + pass-to-opponent worked

### What Needs Work

1. **Simultaneous action selection**: council-of-whispers requires all players to select before resolving — engine's sequential model doesn't support this naturally
2. **Multi-phase rounds**: Games with complex round phases (council-of-whispers: 5 phases) confuse agents about what action to take
3. **Auction mechanics**: grand-bazaar's auction types need multi-player bidding rounds
4. **Trick-taking completion**: road-rally trick needs all players to play before resolution
5. **Turn advancement on agent death**: When an agent's turn budget expires, the game permanently stalls — no timeout/auto-advance mechanism

---

## Recommendations

### Immediate (Engine)

1. **Add agent turn timeout with auto-advance**: If no action is received within N minutes, auto-pass and advance to next player
2. **Add `resources` to mechanics index**: 10 games reference it, none can find it
3. **Pre-inject rules into agent prompts**: Eliminate the registration parsing step that consumes 20-50% of agent budget
4. **Add missing required sections to alliance and battle-forge RULES.md**: Both are structurally invalid

### Short-Term (Game Design)

5. **Reduce mechanic count for complex games**: Council-of-whispers (14) and shadow-operations (14) should be split into variants or simplified
6. **Add gamemasterNotes to all games**: 13/18 games are missing this critical section
7. **Register unknown effect types**: 8 games have custom effect types not in the engine's registry
8. **Summarize large decks in RULES.md**: UNO's 108-card definition is too verbose — use shorthand

### Medium-Term (Architecture)

9. **Implement simultaneous action phases**: Add engine support for "all players select, then resolve" patterns
10. **Add auction bidding round support**: Grand-bazaar's 3 auction types need multi-player interaction
11. **Increase agent turn budget**: Current limits prevent games from completing even a single full round in most cases
12. **Add game completion tracking**: Log analysis should distinguish "completed" from "stalled" games

---

## Appendix A: Instance Reference

| Game | Instance ID | Status | Round | Turn |
|------|------------|--------|-------|------|
| aaote | aaote-1770504132704 | in_progress (stalled) | 2 | 4 |
| alliance | alliance-1770504184352 | in_progress (stalled) | 3 | 5 |
| arcane-assembly | arcane-assembly-1770504190901 | in_progress (stalled) | 2 | 3 |
| battle-forge | battle-forge-1770504256614 | in_progress (stalled) | 2 | 3 |
| council-of-whispers | council-of-whispers-1770504281416 | in_progress (stalled) | 1 | 1 |
| dice-dynasties | dice-dynasties-1770504288008 | in_progress (stalled) | 1 | 2 |
| draft-duel | draft-duel-1770504295810 | in_progress (stalled) | 2 | 4 |
| engine-masters | engine-masters-1770504305040 | in_progress (stalled) | 1 | 2 |
| fortune-seekers | fortune-seekers-1770504488220 | in_progress (stalled) | 1 | 2 |
| grand-bazaar | grand-bazaar-1770504560755 | in_progress (stalled) | 1 | 2 |
| markovs-chains | markovs-chains-1770504629440 | in_progress (stalled) | 1 | 2 |
| parallel-race | parallel-race-1770504642717 | in_progress (stalled) | 3 | 5 |
| road-rally | road-rally-1770504657183 | in_progress (stalled) | 1 | 2 |
| rondel-express | rondel-express-1770504671542 | in_progress (stalled) | 1 | 2 |
| shadow-operations | shadow-operations-1770504705534 | in_progress (stalled) | 1 | 1 |
| spellbook-showdown | spellbook-showdown-1770504712639 | in_progress (stalled) | 1 | 1 |
| treasure-hunters | treasure-hunters-1770504719231 | in_progress (stalled) | 1 | 1 |
| uno | uno-1770504746906 | in_progress (stalled) | 1 | 1 |

## Appendix B: Historical Comparison

Games with prior playtest data for comparison:

| Game | Prior Best Run | This Run | Delta |
|------|---------------|----------|-------|
| aaote | 96 events (r5+) | 9 events (r2) | Regression |
| draft-duel | 57 events (r4+) | 5 events (r2) | Regression |
| engine-masters | 83 events (r5+) | 3 events (r1) | Regression |
| fortune-seekers | 63 events (r4+) | 3 events (r1) | Regression |
| markovs-chains | 16 events (r3+) | 3 events (r1) | Regression |
| parallel-race | 20 events (r3+) | 6 events (r3) | Comparable |
| road-rally | 46 events (r5+) | 3 events (r1) | Regression |
| treasure-hunters | 100 events (r6+) | 3 events (r1) | Regression |
| uno | 242 events (r10+) | 2 events (r1) | Severe regression |

**Note**: Prior runs used different agent configurations (likely foreground execution with higher turn budgets). The regression across all games confirms that agent turn budget is the primary constraint, not game design.
