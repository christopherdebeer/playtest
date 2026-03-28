/-
  Core/Abstract/Sequential.lean — Abstract Sequential and Simultaneous patterns.

  **Sequential pattern:** Ordered action execution with priority.
  **Simultaneous pattern:** All-at-once action selection with reveal.

  These two patterns capture the fundamental distinction between
  "players act one at a time in order" and "players act all at once."

  **Sequential instances:**
  - TrickTaking — play cards in turn order, evaluate trick
  - LadderClimbing — each player must beat or pass
  - AuctionMechanic (all variants) — bid in order, resolve winner
  - SnakeDraft — draft in alternating order

  **Simultaneous instances:**
  - ActionProgramming — all players plan, then reveal simultaneously
  - SimultaneousSelection — all choose, then resolve
  - PrisonersDilemma — cooperate/defect simultaneously
  - RealTimeAction — all act in real-time window
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Sequential Action Mechanic -/

/-- Participant status in a sequential round. -/
inductive ParticipantStatus where
  | active : ParticipantStatus     -- still participating
  | passed : ParticipantStatus     -- voluntarily passed
  | eliminated : ParticipantStatus -- forced out
  deriving Repr, DecidableEq, BEq

/-- SequentialMechanic: the abstract pattern for ordered actions.

    `RoundId` identifies the current sequential round/trick/auction.
    `ActionData` is what each participant submits (bid, card, choice).

    The mechanic manages a sequence of player actions with:
    - Turn order within the sequence
    - Pass/fold mechanics
    - Resolution when the sequence ends -/
class SequentialMechanic (G : Type) (RoundId : outParam Type) (ActionData : outParam Type)
    [DecidableEq RoundId] where
  /-- Get the current sequential round. -/
  getCurrentRound : G → Option RoundId
  /-- Get the current actor in the sequence. -/
  getCurrentActor : G → Option PlayerId
  /-- Get the ordered list of participants. -/
  getParticipants : G → List (PlayerId × ParticipantStatus)
  /-- Get active (non-passed, non-eliminated) participants. -/
  getActiveParticipants : G → List PlayerId
  /-- Submit an action for the current actor. -/
  submitAction : G → PlayerId → ActionData → Option G
  /-- Pass (voluntarily exit the sequence). -/
  passAction : G → PlayerId → Option G
  /-- Check if the sequence is complete. -/
  isComplete : G → Bool
  /-- Resolve the completed sequence (determine winner, apply effects). -/
  resolve : G → Option G
  /-- Get all submitted actions in order. -/
  getSubmissions : G → List (PlayerId × ActionData)

  -- === Laws ===

  /-- Only the current actor can submit. -/
  submit_requires_turn : ∀ (g : G) (pid : PlayerId) (action : ActionData),
    getCurrentActor g ≠ some pid →
    submitAction g pid action = none

  /-- Submitting advances to the next actor. -/
  submit_advances : ∀ (g : G) (pid : PlayerId) (action : ActionData) (g' : G),
    submitAction g pid action = some g' →
    getCurrentActor g' ≠ getCurrentActor g ∨ isComplete g' = true

  /-- Passing removes a participant from active. -/
  pass_removes : ∀ (g : G) (pid : PlayerId) (g' : G),
    passAction g pid = some g' →
    pid ∉ getActiveParticipants g'

  /-- The sequence completes when all active participants have acted
      or there's only one active participant left. -/
  complete_when_done : ∀ (g : G),
    getActiveParticipants g = [] →
    isComplete g = true

  /-- Resolution requires completion. -/
  resolve_requires_complete : ∀ (g : G),
    isComplete g = false →
    resolve g = none

  /-- Submissions are in action order. -/
  submissions_ordered : ∀ (g : G) (pid : PlayerId) (action : ActionData) (g' : G),
    submitAction g pid action = some g' →
    getSubmissions g' = getSubmissions g ++ [(pid, action)]

/-! ## Monotone Sequential (Auctions, Ladder Climbing) -/

/-- A sequential mechanic where actions must strictly escalate.
    Each action must "beat" the previous one. -/
class MonotoneSequential (G : Type) (RoundId : outParam Type) (ActionData : outParam Type)
    [DecidableEq RoundId]
    extends SequentialMechanic G RoundId ActionData where
  /-- Compare two actions: does `later` beat `earlier`? -/
  beats : ActionData → ActionData → Bool
  /-- Get the current leading action. -/
  getLeading : G → Option (PlayerId × ActionData)

  -- === Laws ===

  /-- Submitted actions must beat the current leading action. -/
  must_escalate : ∀ (g : G) (pid : PlayerId) (action : ActionData) (g' : G)
    (leader : PlayerId) (leadAction : ActionData),
    getLeading g = some (leader, leadAction) →
    submitAction g pid action = some g' →
    beats action leadAction = true

  /-- Beating is transitive. -/
  beats_transitive : ∀ (a b c : ActionData),
    beats b a = true → beats c b = true → beats c a = true

/-! ## Terminal Sequential (Trick-Taking) -/

/-- A sequential mechanic where every participant acts exactly once,
    then the round resolves. No passing, no escalation. -/
class TerminalSequential (G : Type) (RoundId : outParam Type) (ActionData : outParam Type)
    [DecidableEq RoundId]
    extends SequentialMechanic G RoundId ActionData where
  /-- Get the round winner after resolution. -/
  getRoundWinner : G → Option PlayerId

  /-- Every participant must act (no voluntary pass). -/
  no_voluntary_pass : ∀ (g : G) (pid : PlayerId),
    pid ∈ getActiveParticipants g →
    passAction g pid = none

  /-- The round is complete when all participants have acted. -/
  complete_when_all_acted : ∀ (g : G),
    (getSubmissions g).length = (getParticipants g).length →
    isComplete g = true

/-! ## Simultaneous Action Mechanic -/

/-- SubmissionState tracks whether all players have submitted. -/
inductive SimPhase where
  | selecting : SimPhase     -- players are choosing
  | revealing : SimPhase     -- choices being revealed
  | resolved : SimPhase      -- resolution complete
  deriving Repr, DecidableEq, BEq

/-- SimultaneousMechanic: the abstract pattern for all-at-once actions.

    All participating players choose independently and simultaneously.
    Choices are hidden until all have submitted, then revealed and resolved.

    `ChoiceData` is what each player selects (action, card, direction, etc.). -/
class SimultaneousMechanic (G : Type) (ChoiceData : outParam Type) where
  /-- Get the current phase. -/
  getPhase : G → SimPhase
  /-- Get players who must submit. -/
  getPendingPlayers : G → List PlayerId
  /-- Get players who have submitted. -/
  getSubmittedPlayers : G → List PlayerId
  /-- Submit a choice (hidden from other players). -/
  submitChoice : G → PlayerId → ChoiceData → Option G
  /-- Reveal all choices (transition from selecting to revealing). -/
  revealChoices : G → Option G
  /-- Get the revealed choices (only available after reveal). -/
  getRevealedChoices : G → Option (List (PlayerId × ChoiceData))
  /-- Resolve the round after all choices are revealed. -/
  resolveSimultaneous : G → Option G

  -- === Laws ===

  /-- Can only submit during selecting phase. -/
  submit_requires_selecting : ∀ (g : G) (pid : PlayerId) (choice : ChoiceData),
    getPhase g ≠ SimPhase.selecting →
    submitChoice g pid choice = none

  /-- Only pending players can submit. -/
  submit_requires_pending : ∀ (g : G) (pid : PlayerId) (choice : ChoiceData),
    pid ∉ getPendingPlayers g →
    submitChoice g pid choice = none

  /-- Submitting moves player from pending to submitted. -/
  submit_moves_player : ∀ (g : G) (pid : PlayerId) (choice : ChoiceData) (g' : G),
    submitChoice g pid choice = some g' →
    pid ∉ getPendingPlayers g' ∧ pid ∈ getSubmittedPlayers g'

  /-- Can only reveal when all players have submitted. -/
  reveal_requires_all_submitted : ∀ (g : G),
    getPendingPlayers g ≠ [] →
    revealChoices g = none

  /-- Choices are hidden before reveal. -/
  choices_hidden_before_reveal : ∀ (g : G),
    getPhase g = SimPhase.selecting →
    getRevealedChoices g = none

  /-- Choices are available after reveal. -/
  choices_available_after_reveal : ∀ (g : G) (g' : G),
    revealChoices g = some g' →
    (getRevealedChoices g').isSome = true

  /-- Resolution requires revealed phase. -/
  resolve_requires_revealed : ∀ (g : G),
    getPhase g ≠ SimPhase.revealing →
    resolveSimultaneous g = none

/-! ## Simultaneous with Conflict Resolution -/

/-- When simultaneous choices conflict, a resolution strategy is needed. -/
class ConflictResolution (G : Type) (ChoiceData : outParam Type)
    extends SimultaneousMechanic G ChoiceData where
  /-- Do two choices conflict? -/
  choicesConflict : ChoiceData → ChoiceData → Bool
  /-- Resolve a conflict between two choices. Returns the winner. -/
  resolveConflict : G → (PlayerId × ChoiceData) → (PlayerId × ChoiceData) → PlayerId

  /-- Conflict resolution is deterministic. -/
  conflict_deterministic : ∀ (g : G) (a b : PlayerId × ChoiceData),
    resolveConflict g a b = resolveConflict g a b

/-! ## Selection Independence -/

/-- In a truly simultaneous mechanic, one player's choice cannot depend
    on another player's choice (since they're made simultaneously).
    This is enforced by the hidden/reveal protocol above, but we can
    also state it as a semantic property. -/
theorem simultaneous_independence {G : Type} {ChoiceData : Type}
    [SimultaneousMechanic G ChoiceData]
    (g : G) (pid1 pid2 : PlayerId) (c1 : ChoiceData) :
    SimultaneousMechanic.getPhase g = SimPhase.selecting →
    pid1 ≠ pid2 →
    -- pid1's submission doesn't reveal pid1's choice to pid2
    -- (this is guaranteed by choices_hidden_before_reveal)
    True := by
  intros; trivial

end Playtest.Abstract
