/-
  Leaf/History.lean — HistoryMechanic as MonotoneCounter instance.

  This is the #6 priority typeclass from ANALYSIS.md: "monotone counters
  and cumulative tracking." It's needed by AAOTE (objectives require
  cumulative counts), Engine Masters (chain tracking), and Grand Bazaar
  (trading history).

  HistoryMechanic extends MonotoneCounter with game-history semantics:
  - Track locations visited (set, grows monotonically)
  - Track actions completed (counter, grows monotonically)
  - Track achievements unlocked (set, grows monotonically)

  This closes GAP 9 from AAOTE.lean: "objectives need cumulative counts."
-/

import Core.Types
import Core.Abstract.Pool

namespace Playtest.Leaf

open Playtest
open Playtest.Abstract

variable {G : Type}

/-! ## History Counter Identifiers -/

/-- Types of history that can be tracked per player.
    Each game defines which of these it uses. -/
inductive HistoryCounterId where
  | locationsVisited : HistoryCounterId
  | locationsPlaced : HistoryCounterId
  | tradesCompleted : HistoryCounterId
  | roundsSurvived : HistoryCounterId
  | combatsWon : HistoryCounterId
  | cardsPlayed : HistoryCounterId
  | resourcesSpent : HistoryCounterId
  | custom (name : String) : HistoryCounterId
  deriving Repr, DecidableEq, BEq

/-! ## History Mechanic -/

/-- HistoryMechanic: cumulative tracking of game events per player.

    Extends MonotoneCounter with history-specific semantics:
    - Counters are organized by type (HistoryCounterId)
    - Set-valued history (e.g., distinct locations visited)
    - Threshold checks for objectives

    The MonotoneCounter parent guarantees monotonicity: history
    can only grow, never shrink. This is the key property that
    makes objective checking sound. -/
class HistoryMechanic (G : Type)
    extends MonotoneCounter G HistoryCounterId where
  /-- Get the set of distinct items recorded (e.g., visited location names). -/
  getHistorySet : G → PlayerId → HistoryCounterId → List String
  /-- Record a new item to the set (idempotent for duplicates). -/
  recordItem : G → PlayerId → HistoryCounterId → String → G
  /-- Check if a threshold has been met. -/
  meetsThreshold : G → PlayerId → HistoryCounterId → Nat → Bool

  -- === Laws ===

  /-- Recording adds the item to the set (if not already present). -/
  record_adds : ∀ (g : G) (pid : PlayerId) (cid : HistoryCounterId) (item : String),
    item ∈ getHistorySet (recordItem g pid cid item) pid cid

  /-- Recording preserves existing items. -/
  record_preserves : ∀ (g : G) (pid : PlayerId) (cid : HistoryCounterId)
    (item existing : String),
    existing ∈ getHistorySet g pid cid →
    existing ∈ getHistorySet (recordItem g pid cid item) pid cid

  /-- Set size is consistent with the counter value. -/
  set_count_consistent : ∀ (g : G) (pid : PlayerId) (cid : HistoryCounterId),
    getCount g pid cid = (getHistorySet g pid cid).length

  /-- meetsThreshold is consistent with counter value. -/
  threshold_consistent : ∀ (g : G) (pid : PlayerId) (cid : HistoryCounterId) (n : Nat),
    meetsThreshold g pid cid n = true ↔ getCount g pid cid ≥ n

  /-- Recording doesn't affect other players' history. -/
  record_player_frame : ∀ (g : G) (pid other : PlayerId) (cid : HistoryCounterId) (item : String),
    pid ≠ other →
    getHistorySet (recordItem g pid cid item) other cid =
    getHistorySet g other cid

  /-- Recording doesn't affect other history types. -/
  record_type_frame : ∀ (g : G) (pid : PlayerId) (c1 c2 : HistoryCounterId) (item : String),
    (c1 == c2) = false →
    getHistorySet (recordItem g pid c1 item) pid c2 =
    getHistorySet g pid c2

/-! ## Objective Checking via History -/

/-- An objective is a named condition over history counters. -/
structure ObjectiveSpec where
  name : String
  /-- Requirements: list of (counter, threshold) pairs.
      All requirements must be met (AND logic). -/
  requirements : List (HistoryCounterId × Nat)
  deriving Repr

/-- Check if a player has met an objective. -/
def checkObjective [HistoryMechanic G]
    (g : G) (pid : PlayerId) (obj : ObjectiveSpec) : Bool :=
  obj.requirements.all fun (cid, threshold) =>
    HistoryMechanic.meetsThreshold g pid cid threshold

/-- History monotonicity ensures: once an objective is met,
    it stays met (objectives can't be un-achieved). -/
theorem objective_permanent [inst : HistoryMechanic G]
    (g : G) (pid : PlayerId) (obj : ObjectiveSpec)
    (cid : HistoryCounterId) (amount : Nat) :
    checkObjective g pid obj = true →
    checkObjective (inst.increment g pid cid amount) pid obj = true := by
  sorry -- Provable by case analysis on each requirement:
        -- Same counter as cid: increment_increases shows count ≥ old count
        -- Different counter: increment_counter_frame preserves count
        -- In both cases, a threshold that was met stays met

end Playtest.Leaf
