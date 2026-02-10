---
name: "Council of Whispers"
version: "1.0"
players: 4-6
win_condition: "highest_score_or_single_loser"
max_rounds: 8

mechanics:
  # Voting system
  voting:
    type: "majority"
    allowAbstain: true
    secret: false
    tiebreaker: "no_action"
    topics:
      - { id: "exile", name: "Exile Vote", description: "Vote to exile a council member" }
      - { id: "policy", name: "Policy Vote", description: "Vote on a proposed policy" }
      - { id: "alliance", name: "Alliance Ratification", description: "Ratify a formal alliance" }

  # Negotiation with binding agreements
  negotiation:
    binding: false
    penalty_for_breaking: 0
    max_agreements: 3
    agreement_types: ["non_aggression", "alliance", "vote_agreement", "custom"]
    allow_public: true
    allow_private: true
    expiration_turns: 3

  # Bribery system
  bribery:
    currency: "gold"
    binding: false
    max_bribe_per_action: 5
    bribe_targets: ["vote", "propose_agreement", "break_agreement"]

  # Alliance formation
  alliances:
    max_alliance_size: 3
    max_alliances: 1
    binding: false
    duration: 4
    shared_victory: false
    shared_resources: []

  # Betting and bluffing on votes
  betting_and_bluffing:
    resource: "gold"
    min_bet: 1
    max_bet: 5
    allow_bluff: true
    bluff_penalty: 3
    bluff_reward: 5
    ante: 1
    betting_rounds: 1

  # Communication limits during certain phases
  communication_limits:
    no_table_talk: false
    team_only: false
    one_word_clues: false
    communication_phases:
      - { phase: "voting", allowed: false }
      - { phase: "action", allowed: true }
    message_types: ["public", "private", "signal"]
    limits:
      private_per_round: 3
      public_per_round: 5
    target_restrictions: []

  # Semi-cooperative: shared treasury must be maintained
  semi_cooperative_game:
    collective_goal: 20
    failure_threshold: 0
    contribution_cost: 1

  # Prisoner's dilemma encounters
  prisoners_dilemma:
    rounds: 3
    payoff:
      both_cooperate: 3
      both_defect: 1
      cooperate_vs_defect: 0
      defect_vs_cooperate: 5

  # Simultaneous action selection each round
  simultaneous_action_selection:
    actions_per_round: 1
    resolution_order: "clockwise"
    reveal_before_resolve: true

  # Single-loser mechanic: lowest score is the real loser
  win_single_loser:
    loser_condition: "lowest_score"
    loser_penalty: "eliminated"

  # Turn order by role
  turn_order_role_order:
    role_priorities:
      Chancellor: 5
      Spymaster: 4
      Treasurer: 3
      General: 2
      Ambassador: 1
      Scholar: 0
    tie_breaker: "clockwise"

  # Hidden roles
  hidden_roles:
    roles:
      - { id: "loyalist", name: "Loyalist", count: 3, team: "council", description: "Wants the council to thrive" }
      - { id: "conspirator", name: "Conspirator", count: 2, team: "shadow", description: "Wants the treasury to fail" }
      - { id: "opportunist", name: "Opportunist", count: 1, team: "solo", description: "Wants to be the richest" }

  # Resources
  resources:
    - { name: "gold", starting_amount: 10, max: 30 }
    - { name: "influence", starting_amount: 3, max: 15 }

  # Action points
  action_points:
    points_per_turn: 2
    action_costs:
      vote: 0
      propose_agreement: 1
      accept_agreement: 0
      reject_agreement: 0
      break_agreement: 1
      offer_bribe: 1
      respond_to_bribe: 0
      propose_alliance: 1
      accept_alliance: 0
      reject_alliance: 0
      break_alliance: 1
      bet: 0
      call_bluff: 0
      contribute: 1
      dilemma_choice: 0
      select_action: 0
      communicate: 0
      signal: 0
      pass: 0
    rollover: false

  win_highest_lowest_scoring: { mode: "highest" }
---

# Council of Whispers

A social deduction game of politics, negotiation, and betrayal. Council members secretly pursue agendas while maintaining a collective treasury, forming alliances, and voting on critical policies.

## Objective

Survive the Council while pursuing your hidden agenda:
- **Loyalists** (3 players): Keep the treasury funded and identify conspirators
- **Conspirators** (2 players): Drain the treasury while avoiding detection
- **Opportunist** (1 player): End with the most personal gold regardless of treasury

The player with the **lowest score** at the end is **eliminated** as the single loser — even "winners" must avoid being the weakest member of their faction.

## Setup

1. Shuffle and deal **hidden role** cards face-down (one per player)
2. Assign public **council positions** randomly:
   - Chancellor (acts first), Spymaster, Treasurer, General, Ambassador, Scholar
3. Each player starts with 10 gold and 3 influence
4. Place 20 gold in the shared treasury

## Roles

### Loyalists (3 players)
Score = personal gold + (treasury value / 2). Want the treasury to thrive.

### Conspirators (2 players)
Score = personal gold + (gold stolen from treasury). Want the treasury to fail.

### Opportunist (1 player)
Score = personal gold only. Plays both sides for profit.

## Gameplay

## Round Structure

Each of the 8 rounds has 5 phases:

### Phase 1: Simultaneous Action Selection
All players secretly choose one strategic action for the round:
- **Scheme**: Gain 2 gold from personal dealings
- **Investigate**: Learn one fact about another player's actions this round
- **Fortify**: Gain 2 influence
- **Subvert**: Attempt to steal 2 gold from the treasury (risky!)

All selections are revealed simultaneously before resolving.

### Phase 2: Negotiation
Players negotiate freely (within limits):
- Propose **agreements** (non-aggression, vote pacts, custom deals)
- **Private messages** limited to 3 per round
- **Public declarations** limited to 5 per round
- Form or break **alliances** (max size 3, max 1 per player)
- **No talking during voting phase**!

### Phase 3: Prisoner's Dilemma
Pairs of players face a **prisoner's dilemma**:

| You \ Them | Cooperate | Defect |
|-----------|-----------|--------|
| **Cooperate** | Both gain 3 gold | You gain 0, they gain 5 |
| **Defect** | You gain 5, they gain 0 | Both gain 1 gold |

Pairings rotate each round. Agreements can influence choices, but aren't binding!

### Phase 4: Voting
A policy is proposed and the council votes:
- **Majority rules** (ties = no action)
- Votes are public — everyone sees who voted how
- Possible votes: Exile a member, tax all players, fund the treasury, raid the treasury
- **Betting**: Before the vote, players may bet on the outcome

### Phase 5: Treasury & Contribution
Each player may **contribute** 1 gold to the treasury (costs 1 AP):
- If the treasury hits 0, **Loyalists suffer -5 VP penalty**
- Conspirators want this to happen!
- The Opportunist doesn't care either way

## Betting and Bluffing

Before each vote, a **betting round** occurs:
- **Ante**: Each player puts 1 gold in the pot
- **Bet**: Wager 1-5 gold on the vote outcome
- **Bluff**: Claim you'll vote a certain way (may be lying)
- **Call Bluff**: Challenge someone's claim — if they lied, they pay 3 gold penalty; if truthful, the challenger pays 5 gold

## Bribery

Spend gold to influence others:
- **Offer bribes** up to 5 gold per action
- Target specific actions: voting, agreements, alliance breaking
- Bribes are **non-binding** — accept the gold, then do what you want!
- The trust economy is everything

## Communication Limits

- **During voting**: No talking! Votes speak for themselves
- **During action phase**: Free negotiation
- **Private messages**: Max 3 per round
- **Public declarations**: Max 5 per round
- **Signals**: Special gestures that may carry hidden meaning

## Semi-Cooperative Treasury

The shared treasury represents the kingdom's stability:
- Starts at 20 gold
- Players can contribute (Loyalist duty) or neglect/raid it
- If it hits 0: Loyalists get -5 VP, Conspirators get +5 VP
- Treasury health is public information

## Scoring

| Role | Score Formula |
|------|---------------|
| Loyalist | Personal gold + (treasury / 2) + successful exile votes |
| Conspirator | Personal gold + stolen treasury gold + (bonus if treasury = 0) |
| Opportunist | Personal gold only |

**The player with the lowest score is eliminated as the Single Loser**, regardless of role.

## Winning

After 8 rounds:
1. All hidden roles are revealed
2. Calculate scores based on role formulas
3. The **single loser** (lowest score) is eliminated
4. Among remaining players, highest score wins

This means even Conspirators need enough gold to not be the loser!

## Strategy Tips

### For Loyalists
1. **Identify conspirators** through voting patterns and treasury contributions
2. **Form alliances** with other suspected Loyalists
3. **Contribute to treasury** — it's half your score
4. **Call bluffs** on suspicious players
5. Watch the Prisoner's Dilemma — who keeps defecting?

### For Conspirators
1. **Act like a Loyalist** — contribute sometimes to avoid detection
2. **Subvert quietly** — don't raid the treasury too obviously
3. **Divide Loyalists** with false accusations
4. **Use bribes** to sway close votes
5. Keep enough personal gold to avoid being the Single Loser

### For the Opportunist
1. **Play both sides** — accept bribes from everyone
2. **Defect in Prisoner's Dilemma** — maximize personal gain
3. **Don't draw attention** — stay in the middle of every vote
4. **Negotiate aggressively** — your only goal is gold

## Mechanic Interplay

This game demonstrates how social mechanics create emergent complexity:
- **Voting + Hidden Roles**: Public votes reveal information, creating deduction opportunities
- **Negotiation + Bribery**: Non-binding deals create trust dynamics
- **Prisoner's Dilemma + Alliances**: Formal alliances tested by iterated dilemmas
- **Betting + Bluffing**: Adds a metagame layer to every vote
- **Communication Limits**: Strategic silence during voting prevents last-minute manipulation
- **Semi-Cooperative + Single Loser**: Everyone must contribute enough to survive
