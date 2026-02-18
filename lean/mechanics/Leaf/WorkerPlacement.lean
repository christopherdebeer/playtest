/-
  Leaf/WorkerPlacement.lean — Worker placement mechanic formalization.

  Mirrors src/mechanics/worker-placement.ts.
  `requires: ['resources']` — expressed as `[ResourceMechanic G]`.

  Worker placement: players place worker tokens on spaces to claim actions.
  Spaces have limited capacity. Workers are retrieved at defined intervals
  (round start, manual action, etc.).
-/

import Core.Resources

namespace Playtest.WorkerPlacement

open Playtest

/-! ## Space Configuration -/

/-- A worker placement space. -/
structure Space where
  id : String
  capacity : Nat          -- max workers (0 = unlimited)
  deriving Repr, DecidableEq, BEq

/-- Worker identity. -/
structure Worker where
  id : String
  owner : PlayerId
  workerType : Option String := none
  deriving Repr, DecidableEq, BEq

/-! ## Placement State -/

/-- Current placements: which workers are on which spaces. -/
def PlacementMap := String → List Worker

instance : Inhabited PlacementMap := ⟨fun _ => []⟩

/-- Get workers on a space. -/
def getWorkersAt (pm : PlacementMap) (spaceId : String) : List Worker :=
  pm spaceId

/-- Count workers on a space. -/
def occupancy (pm : PlacementMap) (spaceId : String) : Nat :=
  (pm spaceId).length

/-- Check if a space has room (capacity 0 means unlimited). -/
def hasRoom (pm : PlacementMap) (space : Space) : Bool :=
  space.capacity == 0 || occupancy pm space.id < space.capacity

/-- Place a worker on a space. -/
def placeWorker (pm : PlacementMap) (space : Space) (worker : Worker) : PlacementMap :=
  fun sid => if sid == space.id then pm space.id ++ [worker] else pm sid

/-- Remove a specific worker from a space. -/
def removeWorker (pm : PlacementMap) (spaceId : String) (worker : Worker) : PlacementMap :=
  fun sid => if sid == spaceId
    then (pm spaceId).filter (· != worker)
    else pm sid

/-- Retrieve all workers owned by a player (return to their pool). -/
def retrieveAll (pm : PlacementMap) (spaces : List Space) (pid : PlayerId) : PlacementMap :=
  fun sid => (pm sid).filter (fun w => w.owner != pid)

/-! ## Player Worker Pool -/

/-- A player's worker pool. -/
structure WorkerPool where
  total : Nat              -- total workers available
  placed : Nat             -- currently placed on board
  deriving Repr

/-- Available (unplaced) workers. -/
def WorkerPool.available (pool : WorkerPool) : Nat :=
  pool.total - pool.placed

/-- Check if player has available workers. -/
def WorkerPool.hasAvailable (pool : WorkerPool) : Bool :=
  pool.placed < pool.total

/-! ## Laws -/

/-- Placing a worker increases occupancy by 1. -/
theorem place_increases_occupancy (pm : PlacementMap) (space : Space) (worker : Worker) :
    occupancy (placeWorker pm space worker) space.id =
    occupancy pm space.id + 1 := by
  simp [occupancy, placeWorker, BEq.beq, List.length_append]

/-- Placing doesn't affect other spaces (frame). -/
theorem place_frame (pm : PlacementMap) (space : Space) (worker : Worker)
    (other : String) (hne : ¬(other == space.id) = true) :
    (placeWorker pm space worker) other = pm other := by
  simp [placeWorker, hne]

/-- Retrieving all of a player's workers makes all their spaces have
    no workers from that player. -/
theorem retrieve_clears_player (pm : PlacementMap) (spaces : List Space)
    (pid : PlayerId) (sid : String) :
    ∀ w, w ∈ (retrieveAll pm spaces pid) sid → w.owner ≠ pid := by
  intro w hw
  simp [retrieveAll, List.mem_filter] at hw
  exact fun h => by simp [h, BEq.beq] at hw

/-- Worker pool invariant: placed ≤ total. -/
def WorkerPool.valid (pool : WorkerPool) : Prop :=
  pool.placed ≤ pool.total

/-- Placing a worker from a valid pool with available workers
    preserves validity. -/
theorem place_preserves_validity (pool : WorkerPool)
    (h : pool.valid) (ha : pool.hasAvailable = true) :
    (WorkerPool.mk pool.total (pool.placed + 1)).valid := by
  simp [WorkerPool.valid, WorkerPool.hasAvailable] at *
  omega

end Playtest.WorkerPlacement

/-! ## Worker Placement Mechanic Typeclass -/

namespace Playtest

/-- The WorkerPlacementMechanic typeclass.
    `requires: ['resources']` is `[ResourceMechanic G]`. -/
class WorkerPlacementMechanic (G : Type) [ResourceMechanic G] where
  /-- Get all placement spaces. -/
  getSpaces : G → List WorkerPlacement.Space
  /-- Get a player's worker pool. -/
  getWorkerPool : G → PlayerId → WorkerPlacement.WorkerPool
  /-- Place a worker on a space. -/
  placeWorker : G → PlayerId → String → Option G
  /-- Retrieve all of a player's workers. -/
  retrieveWorkers : G → PlayerId → G
  /-- Check if a space has room. -/
  hasRoom : G → String → Bool

  -- Laws

  /-- Placing requires an available worker. -/
  place_requires_worker : ∀ (g : G) (pid : PlayerId) (spaceId : String),
    (getWorkerPool g pid).hasAvailable = false →
    placeWorker g pid spaceId = none

  /-- Placing requires room on the space. -/
  place_requires_room : ∀ (g : G) (pid : PlayerId) (spaceId : String),
    hasRoom g spaceId = false →
    placeWorker g pid spaceId = none

  /-- Retrieving returns all workers to the pool. -/
  retrieve_restores : ∀ (g : G) (pid : PlayerId),
    (getWorkerPool (retrieveWorkers g pid) pid).placed = 0

  /-- Worker pool validity is preserved across operations. -/
  pool_always_valid : ∀ (g : G) (pid : PlayerId),
    (getWorkerPool g pid).valid

end Playtest
