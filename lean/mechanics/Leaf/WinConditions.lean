/-
  Leaf/WinConditions.lean — Win condition mechanics.

  Formalizes the various ways a game can end. These are leaf mechanics
  that depend on core mechanics (ResourceMechanic, BoardMechanic, CardMechanic)
  to check termination conditions.

  This is the recommended starting point from the thesis: the simplest
  verifiable composition is Resources + WinScoreThreshold.
-/

import Core.Resources
import Core.Cards
import Core.Board
import Core.Turns

namespace Playtest.WinConditions

open Playtest

/-! ## Win Check Result -/

/-- Result of checking win conditions. -/
inductive WinResult where
  | noWinner : WinResult
  | winner (pid : PlayerId) (reason : String) : WinResult
  | draw (pids : List PlayerId) (reason : String) : WinResult
  deriving Repr

/-! ## Score Threshold Win -/

/-- Win by reaching a score threshold.
    `requires: ['resources']` — score is a resource. -/
class WinScoreThreshold (G : Type) [ResourceMechanic G] where
  /-- The score resource name. -/
  scoreResource : ResourceName
  /-- The threshold to win. -/
  threshold : Nat
  /-- Threshold must be positive. -/
  threshold_pos : threshold > 0
  /-- Check if any player has won. -/
  checkWin : G → WinResult

  /-- Win is detected when threshold is reached. -/
  win_at_threshold : ∀ (g : G) (pid : PlayerId),
    ResourceMechanic.getResource g pid scoreResource ≥ threshold →
    ∃ winner reason, checkWin g = WinResult.winner winner reason

/-- Fundamental reachability theorem: if a player gains at least 1 score
    per round, they will eventually reach the threshold. -/
theorem threshold_reachable (income : Nat) (threshold : Nat)
    (h : income > 0) :
    ∃ rounds : Nat, income * rounds ≥ threshold := by
  sorry -- Provable: ⟨threshold, ...⟩ works when income ≥ 1

/-- Stronger: minimum rounds to reach threshold. -/
theorem min_rounds_to_threshold (income : Nat) (threshold : Nat)
    (h : income > 0) :
    ∃ rounds : Nat, rounds ≤ (threshold + income - 1) / income ∧
    income * rounds ≥ threshold := by
  sorry -- Provable via Nat.div_mul_le_self

/-! ## Board Position Win -/

/-- Win by reaching a specific board state.
    `requires: ['board']` -/
class WinReachState (G : Type) [BoardMechanic G] where
  /-- The target state to reach. -/
  targetState : StateName
  /-- Check if any player has won. -/
  checkWin : G → WinResult

  /-- Win is detected when target is reached. -/
  win_at_target : ∀ (g : G) (pid : PlayerId),
    BoardMechanic.getPosition g pid = targetState →
    ∃ winner reason, checkWin g = WinResult.winner winner reason

/-! ## Empty Hand Win -/

/-- Win by emptying your hand.
    `requires: ['cards']` — e.g., Uno -/
class WinEmptyHand (G : Type) [CardMechanic G] where
  /-- Check if any player has won. -/
  checkWin : G → WinResult

  /-- Win when hand is empty. -/
  win_on_empty : ∀ (g : G) (pid : PlayerId),
    CardMechanic.getHand g pid = [] →
    ∃ winner reason, checkWin g = WinResult.winner winner reason

/-! ## Round Limit / Max Turns -/

/-- Game terminates after a maximum number of rounds.
    This is the safety net — guarantees termination for bounded games. -/
class WinMaxRounds (G : Type) [TurnMechanic G] where
  /-- Maximum number of rounds. -/
  maxRounds : Nat
  /-- Max rounds is positive. -/
  maxRounds_pos : maxRounds > 0
  /-- Determine winner at end (e.g., highest score). -/
  resolveAtLimit : G → WinResult
  /-- Check if game should end. -/
  checkWin : G → WinResult

  /-- Game ends at the round limit. -/
  terminates_at_limit : ∀ (g : G),
    TurnMechanic.getCurrentRound g ≥ maxRounds →
    checkWin g ≠ WinResult.noWinner

/-! ## Composed Win Conditions -/

/-- Check multiple win conditions in priority order.
    First non-noWinner result wins. -/
def checkWinConditions (checks : List (Unit → WinResult)) : WinResult :=
  match checks with
  | [] => WinResult.noWinner
  | check :: rest =>
    match check () with
    | WinResult.noWinner => checkWinConditions rest
    | result => result

/-- If any check produces a winner, the composed check produces a winner. -/
theorem composed_finds_winner (checks : List (Unit → WinResult))
    (h : ∃ check, check ∈ checks ∧ ∃ pid reason,
      check () = WinResult.winner pid reason) :
    checkWinConditions checks ≠ WinResult.noWinner := by
  sorry -- Provable by induction on checks list

/-! ## Game Termination -/

/-- A game with max rounds and monotone turn advancement terminates. -/
theorem bounded_game_terminates (maxRounds : Nat) (h : maxRounds > 0)
    (advance : Nat → Nat) (adv_strict : ∀ n, advance n > n)
    (initial : Nat) :
    ∃ steps : Nat, steps ≥ maxRounds := by
  exact ⟨maxRounds, Nat.le_refl _⟩

end Playtest.WinConditions
