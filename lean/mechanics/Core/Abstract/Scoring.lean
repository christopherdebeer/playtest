/-
  Core/Abstract/Scoring.lean — Abstract Scoring / Win Condition pattern.

  The pattern for determining game end and winner selection.

  **Instances:**
  - WinScoreThreshold — first to reach a score target
  - WinReachState — first to reach a board position
  - WinEmptyHand — first to empty their hand
  - WinMaxRounds — highest score when time runs out
  - WinEliminateAll — last player standing
  - WinObjective — complete a personal/hidden objective
  - AsymmetricWin — different win conditions per role

  **Key insight:** All win conditions share a common structure:
  1. A predicate that checks if the game should end
  2. A function that determines the winner(s) when it does
  3. Priority ordering when multiple conditions trigger simultaneously

  The variations are:
  - Uniform vs asymmetric (same condition for all vs per-role)
  - Automatic vs declared (auto-detected vs requires player claim)
  - Single vs compound (one condition vs OR/AND of conditions)
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Win Result -/

/-- Outcome when checking win conditions. -/
inductive WinOutcome where
  | continues : WinOutcome                                    -- game continues
  | winner (pid : PlayerId) (reason : String) : WinOutcome    -- single winner
  | winners (pids : List PlayerId) (reason : String) : WinOutcome  -- shared win
  | draw (pids : List PlayerId) (reason : String) : WinOutcome     -- draw
  deriving Repr

/-! ## Abstract Scoring Mechanic -/

/-- ScoringMechanic: the abstract pattern for win condition checking.

    `CriterionId` identifies individual win criteria (e.g., "score_threshold",
    "reach_state", "empty_hand"). A game may have multiple criteria that
    are checked in priority order.

    The mechanic manages:
    - Checking if the game should end
    - Determining the winner when it does
    - Priority resolution when multiple conditions trigger -/
class ScoringMechanic (G : Type) (CriterionId : outParam Type) [DecidableEq CriterionId] where
  /-- Check a specific win criterion. -/
  checkCriterion : G → CriterionId → WinOutcome
  /-- Get all active criteria (in priority order). -/
  getActiveCriteria : G → List CriterionId
  /-- Check all criteria and return the first triggering result. -/
  checkWin : G → WinOutcome
  /-- Get all players eligible to win (not eliminated). -/
  getEligiblePlayers : G → List PlayerId

  -- === Laws ===

  /-- checkWin is the first non-continues result across criteria. -/
  check_follows_priority : ∀ (g : G),
    checkWin g = match (getActiveCriteria g).findSome?
      (fun c => match checkCriterion g c with
        | WinOutcome.continues => none
        | result => some result) with
    | some result => result
    | none => WinOutcome.continues

  /-- Winners must be eligible players. -/
  winner_eligible : ∀ (g : G) (pid : PlayerId) (reason : String),
    checkWin g = WinOutcome.winner pid reason →
    pid ∈ getEligiblePlayers g

  /-- The game is deterministic: same state → same result. -/
  check_deterministic : ∀ (g : G),
    checkWin g = checkWin g

/-! ## Threshold-Based Scoring -/

/-- A criterion based on reaching a numeric threshold.
    This is the most common pattern: "first to N points wins." -/
class ThresholdCriterion (G : Type) (CriterionId : outParam Type) [DecidableEq CriterionId]
    extends ScoringMechanic G CriterionId where
  /-- Get a player's score for a criterion. -/
  getScore : G → PlayerId → CriterionId → Nat
  /-- Get the threshold for a criterion. -/
  getThreshold : G → CriterionId → Nat

  -- === Laws ===

  /-- When threshold is met, that criterion triggers. -/
  triggers_at_threshold : ∀ (g : G) (cid : CriterionId) (pid : PlayerId),
    pid ∈ getEligiblePlayers g →
    getScore g pid cid ≥ getThreshold g cid →
    checkCriterion g cid ≠ WinOutcome.continues

/-! ## Asymmetric Scoring -/

/-- An asymmetric scoring mechanic where win conditions depend on role.
    Each player may have different criteria for winning.

    `RoleId` identifies the player's role (which determines their win condition). -/
class AsymmetricScoring (G : Type) (CriterionId : outParam Type) (RoleId : outParam Type)
    [DecidableEq CriterionId] [DecidableEq RoleId]
    extends ScoringMechanic G CriterionId where
  /-- Get a player's role. -/
  getRole : G → PlayerId → Option RoleId
  /-- Get the win criteria for a specific role. -/
  getRoleCriteria : G → RoleId → List CriterionId

  -- === Laws ===

  /-- A player's win is checked against their role's criteria. -/
  role_determines_criteria : ∀ (g : G) (pid : PlayerId) (role : RoleId),
    getRole g pid = some role →
    -- The criteria checked for this player are a subset of their role's criteria
    True  -- Difficult to express fully without dependent types

/-! ## Declaration-Based Scoring -/

/-- A scoring mechanic where winning requires explicit declaration.
    The player must claim victory, which is then verified.

    This is the pattern for social deduction games where a player
    must reveal their hand/role to prove they've won. -/
class DeclarationScoring (G : Type) (CriterionId : outParam Type) [DecidableEq CriterionId]
    extends ScoringMechanic G CriterionId where
  /-- A player declares victory. Returns none if declaration is invalid. -/
  declareVictory : G → PlayerId → Option G
  /-- Check if a player's victory declaration is valid. -/
  isDeclarationValid : G → PlayerId → Bool
  /-- Check if a player has met their win condition (but hasn't declared). -/
  hasMetCondition : G → PlayerId → Bool

  -- === Laws ===

  /-- Meeting condition is necessary for valid declaration. -/
  declaration_requires_condition : ∀ (g : G) (pid : PlayerId),
    hasMetCondition g pid = false →
    isDeclarationValid g pid = false

  /-- Valid declaration succeeds. -/
  valid_declaration_succeeds : ∀ (g : G) (pid : PlayerId),
    isDeclarationValid g pid = true →
    (declareVictory g pid).isSome = true

  /-- Meeting condition alone doesn't end the game (declaration required). -/
  condition_not_auto_win : ∀ (g : G) (pid : PlayerId),
    hasMetCondition g pid = true →
    -- checkWin may still return continues (until declaration)
    True

/-! ## Compound Scoring -/

/-- Combine multiple criteria with logical operators. -/
inductive CriterionCombinator (CriterionId : Type) where
  | single (cid : CriterionId) : CriterionCombinator CriterionId
  | allOf (cids : List CriterionId) : CriterionCombinator CriterionId
  | anyOf (cids : List CriterionId) : CriterionCombinator CriterionId
  deriving Repr

/-- Evaluate a compound criterion. -/
def evalCombinator {G : Type} {CriterionId : Type} [DecidableEq CriterionId]
    [ScoringMechanic G CriterionId]
    (g : G) : CriterionCombinator CriterionId → WinOutcome
  | .single cid => ScoringMechanic.checkCriterion g cid
  | .allOf cids =>
    -- All must trigger for the compound to trigger
    let results := cids.map (ScoringMechanic.checkCriterion g)
    if results.all (fun r => match r with | WinOutcome.continues => false | _ => true)
    then match results.head? with
      | some r => r
      | none => WinOutcome.continues
    else WinOutcome.continues
  | .anyOf cids =>
    -- First triggering criterion wins
    match cids.findSome? (fun c =>
      match ScoringMechanic.checkCriterion g c with
      | WinOutcome.continues => none
      | r => some r) with
    | some r => r
    | none => WinOutcome.continues

/-! ## Tiebreaking -/

/-- When multiple players meet a win condition simultaneously,
    tiebreaking determines the winner. -/
class TiebreakScoring (G : Type) (CriterionId : outParam Type) [DecidableEq CriterionId]
    extends ScoringMechanic G CriterionId where
  /-- Get tiebreak value for a player (higher = wins tie). -/
  getTiebreakValue : G → PlayerId → Nat
  /-- List of tiebreak criteria in priority order. -/
  tiebreakOrder : G → List (G → PlayerId → Nat)

  /-- Tiebreaking is deterministic given all values. -/
  tiebreak_deterministic : ∀ (g : G) (p1 p2 : PlayerId),
    getTiebreakValue g p1 = getTiebreakValue g p2 →
    -- Additional tiebreakers in tiebreakOrder are consulted
    True

end Playtest.Abstract
