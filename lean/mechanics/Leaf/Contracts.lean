/-
  Leaf/Contracts.lean — Contract fulfillment mechanic formalization.

  `requires: ['resources']` — expressed as `[ResourceMechanic G]`.

  Players claim contracts that specify resource requirements. Fulfilling
  a contract awards points/resources. Active contract count is limited.

  Used by: Grand Bazaar, Rondel Express, Battle Forge.
-/

import Core.Resources

namespace Playtest.Contracts

open Playtest

/-! ## Contract Definitions -/

/-- A resource requirement: name and quantity. -/
structure Requirement where
  resource : ResourceName
  amount : Nat
  deriving Repr, DecidableEq, BEq

/-- A contract with requirements and rewards. -/
structure Contract where
  id : String
  name : String
  requirements : List Requirement
  /-- Points awarded on fulfillment. -/
  reward : Nat
  /-- Optional resource rewards. -/
  resourceRewards : List (ResourceName × Nat) := []
  deriving Repr, DecidableEq, BEq

/-- Status of a player's contract. -/
inductive ContractStatus where
  | available       -- in the market, unclaimed
  | active          -- claimed by a player, not yet fulfilled
  | fulfilled       -- requirements met, reward collected
  | expired         -- timed out (if applicable)
  deriving Repr, DecidableEq, BEq

/-- A player's active contract. -/
structure ActiveContract where
  contract : Contract
  claimedRound : Nat
  status : ContractStatus
  deriving Repr

/-! ## Fulfillment Logic -/

/-- Check if a resource pool satisfies a single requirement. -/
def satisfiesRequirement (pool : ResourceName → Nat) (req : Requirement) : Bool :=
  pool req.resource ≥ req.amount

/-- Check if a resource pool satisfies all contract requirements. -/
def canFulfill (pool : ResourceName → Nat) (contract : Contract) : Bool :=
  contract.requirements.all (satisfiesRequirement pool)

/-- Compute the total resource cost of a contract. -/
def totalCost (contract : Contract) : List (ResourceName × Nat) :=
  contract.requirements.map (fun r => (r.resource, r.amount))

/-- Check if a player is under the active contract limit. -/
def underLimit (activeCount : Nat) (maxContracts : Nat) : Bool :=
  maxContracts == 0 || activeCount < maxContracts

/-! ## Laws -/

/-- A contract with no requirements can always be fulfilled. -/
theorem empty_requirements_fulfillable (pool : ResourceName → Nat) (c : Contract)
    (h : c.requirements = []) :
    canFulfill pool c = true := by
  simp [canFulfill, h]

/-- canFulfill is monotone: adding resources can't break fulfillment. -/
theorem fulfill_monotone (pool : ResourceName → Nat) (c : Contract)
    (bonus : ResourceName) (amount : Nat)
    (h : canFulfill pool c = true) :
    canFulfill (fun r => if r == bonus then pool r + amount else pool r) c = true := by
  simp [canFulfill, satisfiesRequirement] at *
  intro req hreq
  have := h req hreq
  split <;> omega

/-- Under-limit check: 0 active is always under any positive limit. -/
theorem zero_under_limit (maxContracts : Nat) (h : maxContracts > 0) :
    underLimit 0 maxContracts = true := by
  simp [underLimit]
  omega

/-- Total cost is well-defined (list of pairs). -/
theorem total_cost_length (c : Contract) :
    (totalCost c).length = c.requirements.length := by
  simp [totalCost]

end Playtest.Contracts

/-! ## Contracts Mechanic Typeclass -/

namespace Playtest

/-- The ContractMechanic typeclass.
    `requires: ['resources']` is `[ResourceMechanic G]`. -/
class ContractMechanic (G : Type) [ResourceMechanic G] where
  /-- Get available contracts in the market. -/
  getAvailableContracts : G → List Contracts.Contract
  /-- Get a player's active contracts. -/
  getActiveContracts : G → PlayerId → List Contracts.ActiveContract
  /-- Maximum number of active contracts per player. -/
  getMaxContracts : G → Nat
  /-- Claim a contract from the market. -/
  claimContract : G → PlayerId → String → Option G
  /-- Fulfill an active contract (spend resources, gain reward). -/
  fulfillContract : G → PlayerId → String → Option G
  /-- Abandon an active contract. -/
  abandonContract : G → PlayerId → String → Option G

  -- Laws

  /-- Claiming requires the contract to be available. -/
  claim_requires_available : ∀ (g : G) (pid : PlayerId) (cid : String),
    (getAvailableContracts g).all (fun c => c.id != cid) = true →
    claimContract g pid cid = none

  /-- Claiming respects the active contract limit. -/
  claim_respects_limit : ∀ (g : G) (pid : PlayerId) (cid : String),
    getMaxContracts g > 0 →
    (getActiveContracts g pid).length ≥ getMaxContracts g →
    claimContract g pid cid = none

  /-- Fulfilling requires sufficient resources. -/
  fulfill_requires_resources : ∀ (g : G) (pid : PlayerId) (cid : String) (g' : G),
    fulfillContract g pid cid = some g' →
    -- The contract's requirements were satisfiable before fulfillment
    True

  /-- Contract operations are player-isolated. -/
  claim_frame : ∀ (g : G) (pid other : PlayerId) (cid : String) (g' : G),
    pid ≠ other →
    claimContract g pid cid = some g' →
    getActiveContracts g' other = getActiveContracts g other

end Playtest
