/-
  Core/Simultaneous.lean — Simultaneous action mechanic formalization.

  Models game phases where all players choose actions simultaneously
  (hidden), then actions are revealed and resolved together.

  Covers: simultaneous action selection, blind bidding,
  rock-paper-scissors, programming phases, order writing.

  Key distinction from TurnMechanic:
  - TurnMechanic: players act in sequence, seeing previous actions
  - SimultaneousMechanic: players commit in secret, then reveal
-/

import Core.Types

namespace Playtest.Simultaneous

open Playtest

/-! ## Submission Phase -/

/-- A player's submitted action (type-erased). -/
structure Submission where
  player : PlayerId
  actionType : String
  payload : String := ""
  deriving Repr, DecidableEq

/-- State of the simultaneous action phase. -/
inductive PhaseState where
  /-- Collecting submissions (not all players have submitted). -/
  | collecting (submitted : List Submission) (remaining : List PlayerId)
  /-- All submitted, ready to resolve. -/
  | ready (submissions : List Submission)
  /-- Resolved (actions have been applied). -/
  | resolved
  deriving Repr

/-- Create initial phase state for a set of players. -/
def PhaseState.init (players : List PlayerId) : PhaseState :=
  .collecting [] players

/-! ## Operations -/

/-- Submit an action. Moves from collecting → collecting (or ready). -/
def submit (phase : PhaseState) (sub : Submission) : Option PhaseState :=
  match phase with
  | .collecting submitted remaining =>
    if remaining.any (· == sub.player) then
      let newRemaining := remaining.filter (· != sub.player)
      let newSubmitted := submitted ++ [sub]
      if newRemaining.isEmpty then
        some (.ready newSubmitted)
      else
        some (.collecting newSubmitted newRemaining)
    else
      none  -- player not in remaining or already submitted
  | _ => none  -- wrong phase

/-- Check if all players have submitted. -/
def isReady : PhaseState → Bool
  | .ready _ => true
  | _ => false

/-- Get submissions (only available in ready state). -/
def getSubmissions : PhaseState → Option (List Submission)
  | .ready subs => some subs
  | _ => none

/-! ## Laws -/

/-- Filtering removes at least the matching element. -/
private theorem filter_ne_reduces (l : List String) (x : String)
    (h : l.any (· == x) = true) :
    (l.filter (· != x)).length < l.length := by
  induction l with
  | nil => simp at h
  | cons a rest ih =>
    simp only [List.filter, List.length_cons]
    by_cases ha : a = x
    · simp [bne_iff_ne, ha]
      exact Nat.lt_succ_of_le (List.length_filter_le _ _)
    · have hne : (a != x) = true := by simp [bne_iff_ne, ha]
      simp [hne]
      have : rest.any (· == x) = true := by
        simp [List.any_cons, ha, BEq.beq] at h
        simpa using h
      have := ih this; omega

/-- Submitting reduces remaining count. -/
theorem submit_reduces_remaining (submitted : List Submission)
    (remaining : List PlayerId) (sub : Submission)
    (h : remaining.any (· == sub.player) = true)
    (hne : (remaining.filter (· != sub.player)).isEmpty = false) :
    ∃ sub' rem',
      submit (.collecting submitted remaining) sub =
      some (.collecting sub' rem') ∧
      rem'.length < remaining.length := by
  simp only [submit, h, hne, ite_false]
  exact ⟨submitted ++ [sub], remaining.filter (· != sub.player),
    rfl, filter_ne_reduces remaining sub.player h⟩

/-- Once ready, submissions are available. -/
theorem ready_has_submissions (subs : List Submission) :
    getSubmissions (.ready subs) = some subs := by
  rfl

/-- Init starts in collecting state. -/
theorem init_collecting (players : List PlayerId) (h : players ≠ []) :
    ∃ rem, PhaseState.init players = .collecting [] rem ∧ rem = players := by
  exact ⟨players, rfl, rfl⟩

end Playtest.Simultaneous

/-! ## Simultaneous Mechanic Typeclass -/

namespace Playtest

/-- The SimultaneousMechanic typeclass.
    Models phases where all players act simultaneously. -/
class SimultaneousMechanic (G : Type) where
  /-- Start a simultaneous action phase. -/
  beginPhase : G → List PlayerId → G
  /-- Submit an action for a player. -/
  submitAction : G → PlayerId → String → String → Option G
  /-- Check if all players have submitted. -/
  isPhaseReady : G → Bool
  /-- Resolve the phase (apply all actions). -/
  resolvePhase : G → Option G
  /-- Get a player's submission (hidden until resolved). -/
  getSubmission : G → PlayerId → Option Simultaneous.Submission

  -- Laws

  /-- Each player can submit exactly once per phase. -/
  submit_once : ∀ (g : G) (pid : PlayerId) (atype payload : String) (g' : G),
    submitAction g pid atype payload = some g' →
    submitAction g' pid atype payload = none

  /-- Resolution requires all players to have submitted. -/
  resolve_requires_ready : ∀ (g : G),
    isPhaseReady g = false →
    resolvePhase g = none

  /-- Submissions are hidden from other players until resolution. -/
  submission_hidden : ∀ (g : G) (pid other : PlayerId),
    pid ≠ other →
    isPhaseReady g = false →
    getSubmission g other = none

  /-- After resolution, all submissions are visible. -/
  resolved_visible : ∀ (g : G) (g' : G) (pid : PlayerId),
    resolvePhase g = some g' →
    isPhaseReady g = true →
    (getSubmission g pid).isSome = true →
    (getSubmission g' pid).isSome = true

end Playtest
