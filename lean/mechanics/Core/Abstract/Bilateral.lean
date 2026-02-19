/-
  Core/Abstract/Bilateral.lean — Abstract Bilateral mechanic pattern.

  The pattern for two-party interactions with offer/accept/decline protocol.

  **Instances:**
  - TradingMechanic — item exchange between two players
  - NegotiationMechanic — treaty/deal proposals
  - AllianceMechanic — alliance formation/dissolution
  - ChallengeMechanic — direct player-vs-player challenges
  - I-Cut-You-Choose — one player splits, another picks

  **Key insight:** All bilateral mechanics share a protocol:
  1. One party initiates (offer/propose/challenge)
  2. The other party responds (accept/decline/counter)
  3. On acceptance, both parties' states change atomically

  The critical laws are:
  - CONSENT: both parties must agree for the interaction to execute
  - ATOMICITY: the exchange happens in one step (no partial trades)
  - OWNERSHIP: you can only offer what you have
  - OUT-OF-TURN: the responder may act outside normal turn order
-/

import Core.Types

namespace Playtest.Abstract

open Playtest

/-! ## Abstract Bilateral Mechanic -/

/-- Response to a bilateral proposal. -/
inductive ProposalResponse where
  | accept : ProposalResponse
  | decline : ProposalResponse
  | counter (modification : String) : ProposalResponse
  deriving Repr, DecidableEq

/-- Status of a bilateral proposal. -/
inductive ProposalStatus where
  | pending : ProposalStatus
  | accepted : ProposalStatus
  | declined : ProposalStatus
  | expired : ProposalStatus
  | countered : ProposalStatus
  deriving Repr, DecidableEq

/-- BilateralMechanic: the abstract pattern for two-party interactions.

    `ProposalId` identifies a specific proposal.
    `ProposalData` is the content of a proposal (what's being offered/requested).

    The mechanic manages a protocol where one party proposes, another
    responds, and on acceptance the game state changes atomically. -/
class BilateralMechanic (G : Type) (ProposalId : outParam Type) (ProposalData : outParam Type)
    [DecidableEq ProposalId] where
  /-- Create a new proposal. Returns none if invalid. -/
  propose : G → PlayerId → PlayerId → ProposalData → Option (G × ProposalId)
  /-- Respond to a pending proposal. -/
  respond : G → ProposalId → ProposalResponse → Option G
  /-- Get a pending proposal by ID. -/
  getProposal : G → ProposalId → Option (PlayerId × PlayerId × ProposalData × ProposalStatus)
  /-- Get all pending proposals for a player (as target). -/
  getPendingFor : G → PlayerId → List ProposalId
  /-- Cancel a proposal (by initiator only). -/
  cancel : G → ProposalId → PlayerId → Option G

  -- === Laws ===

  /-- A new proposal starts in pending status. -/
  propose_creates_pending : ∀ (g : G) (initiator target : PlayerId) (data : ProposalData)
    (g' : G) (pid : ProposalId),
    propose g initiator target data = some (g', pid) →
    ∃ d, getProposal g' pid = some (initiator, target, d, ProposalStatus.pending)

  /-- Only pending proposals can be responded to. -/
  respond_requires_pending : ∀ (g : G) (pid : ProposalId) (resp : ProposalResponse),
    (match getProposal g pid with
     | some (_, _, _, ProposalStatus.pending) => true
     | _ => false) = false →
    respond g pid resp = none

  /-- Accepting a proposal changes its status. -/
  accept_changes_status : ∀ (g : G) (pid : ProposalId) (g' : G),
    respond g pid ProposalResponse.accept = some g' →
    ∃ init tgt d, getProposal g' pid = some (init, tgt, d, ProposalStatus.accepted)

  /-- Declining a proposal changes its status. -/
  decline_changes_status : ∀ (g : G) (pid : ProposalId) (g' : G),
    respond g pid ProposalResponse.decline = some g' →
    ∃ init tgt d, getProposal g' pid = some (init, tgt, d, ProposalStatus.declined)

  /-- Proposals don't affect uninvolved players' game state.
      (The exact meaning of "affect" depends on the concrete instance,
       but at minimum, uninvolved players' proposals are unchanged.) -/
  proposal_isolation : ∀ (g : G) (pid : ProposalId) (resp : ProposalResponse) (g' : G)
    (other_pid : ProposalId),
    pid ≠ other_pid →
    respond g pid resp = some g' →
    getProposal g' other_pid = getProposal g other_pid

  /-- Only the initiator can cancel. -/
  cancel_requires_initiator : ∀ (g : G) (pid : ProposalId) (canceller : PlayerId),
    (match getProposal g pid with
     | some (initiator, _, _, _) => initiator ≠ canceller
     | none => True) →
    cancel g pid canceller = none

/-! ## Bilateral with Ownership Validation -/

/-- A bilateral mechanic where proposals involve transferring owned items.
    This adds ownership validation: you can only offer what you have. -/
class OwnedBilateral (G : Type) (ProposalId : outParam Type) (ProposalData : outParam Type)
    (ItemType : outParam Type)
    [DecidableEq ProposalId] [DecidableEq ItemType]
    extends BilateralMechanic G ProposalId ProposalData where
  /-- Get items a player currently owns. -/
  getOwnedItems : G → PlayerId → List ItemType
  /-- Extract the items being offered by the initiator. -/
  getOfferedItems : ProposalData → List ItemType
  /-- Extract the items being requested from the target. -/
  getRequestedItems : ProposalData → List ItemType

  -- === Laws ===

  /-- Initiator must own all offered items. -/
  offer_requires_ownership : ∀ (g : G) (initiator target : PlayerId)
    (data : ProposalData) (g' : G) (pid : ProposalId),
    propose g initiator target data = some (g', pid) →
    (getOfferedItems data).all (fun item => (getOwnedItems g initiator).any (· == item)) = true

  /-- Target must own all requested items (checked at response time). -/
  accept_requires_ownership : ∀ (g : G) (pid : ProposalId) (g' : G)
    (init tgt : PlayerId) (data : ProposalData) (status : ProposalStatus),
    getProposal g pid = some (init, tgt, data, status) →
    respond g pid ProposalResponse.accept = some g' →
    (getRequestedItems data).all (fun item => (getOwnedItems g tgt).any (· == item)) = true

  /-- After acceptance, items have been exchanged. -/
  accept_transfers_items : ∀ (g : G) (pid : ProposalId) (g' : G)
    (init tgt : PlayerId) (data : ProposalData),
    getProposal g pid = some (init, tgt, data, ProposalStatus.pending) →
    respond g pid ProposalResponse.accept = some g' →
    -- Offered items move from initiator to target
    (getOfferedItems data).all (fun item => (getOwnedItems g' tgt).any (· == item)) = true ∧
    -- Requested items move from target to initiator
    (getRequestedItems data).all (fun item => (getOwnedItems g' init).any (· == item)) = true

/-! ## Out-of-Turn Response -/

/-- Marker class indicating a bilateral mechanic allows out-of-turn responses.
    When this is present, the responder can act even when TurnMechanic says
    it's not their turn. This is a cross-mechanic concern that the composition
    layer needs to handle. -/
class OutOfTurnBilateral (G : Type) (ProposalId : outParam Type) (ProposalData : outParam Type)
    [DecidableEq ProposalId]
    extends BilateralMechanic G ProposalId ProposalData where
  /-- A player with a pending proposal can always respond,
      regardless of whose turn it is. -/
  can_respond_anytime : ∀ (g : G) (pid : ProposalId) (target : PlayerId)
    (init : PlayerId) (data : ProposalData),
    getProposal g pid = some (init, target, data, ProposalStatus.pending) →
    -- The target can respond (this is a capability statement)
    True

end Playtest.Abstract
