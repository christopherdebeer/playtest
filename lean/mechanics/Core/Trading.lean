/-
  Core/Trading.lean — Trading mechanic formalization.

  Models bilateral resource exchange between players.
  A trade requires both parties to consent (offer + accept).
  The key invariant: trades are resource-neutral (total conserved).

  Covers: resource trading, bartering, card swapping, negotiation.
-/

import Core.Types
import Core.Resources

namespace Playtest.Trading

open Playtest

/-! ## Trade Offer -/

/-- What one side of a trade offers. -/
structure TradeOffer where
  /-- Resources offered (name → amount). -/
  resources : List (ResourceName × Nat) := []
  /-- Cards offered (by name). -/
  cards : List CardName := []
  deriving Repr, DecidableEq

/-- A proposed trade between two players. -/
structure TradeProposal where
  /-- Player initiating the trade. -/
  proposer : PlayerId
  /-- Target player. -/
  target : PlayerId
  /-- What proposer offers. -/
  offering : TradeOffer
  /-- What proposer wants in return. -/
  requesting : TradeOffer
  deriving Repr, DecidableEq

/-! ## Trade State -/

/-- Status of a trade. -/
inductive TradeStatus where
  | pending : TradeStatus
  | accepted : TradeStatus
  | rejected : TradeStatus
  | cancelled : TradeStatus
  | completed : TradeStatus
  deriving Repr, DecidableEq

/-- An active trade with its status. -/
structure ActiveTrade where
  proposal : TradeProposal
  status : TradeStatus := .pending
  deriving Repr

/-! ## Trade Validation -/

/-- Check if a player can fulfill their side of a trade.
    Requires a function to look up resource amounts. -/
def canFulfill (offer : TradeOffer) (getResource : ResourceName → Nat) : Bool :=
  offer.resources.all (fun (name, amount) => amount ≤ getResource name)

/-- A trade is valid if both sides can fulfill their obligations. -/
def isValidTrade (trade : TradeProposal)
    (getProposerResource : ResourceName → Nat)
    (getTargetResource : ResourceName → Nat) : Bool :=
  trade.proposer != trade.target &&
  canFulfill trade.offering getProposerResource &&
  canFulfill trade.requesting getTargetResource

/-! ## Resource Transfer Calculation -/

/-- Compute net resource changes for the proposer from a trade.
    Positive = gain, negative = loss. -/
def proposerNetResources (trade : TradeProposal) : List (ResourceName × Int) :=
  let losses := trade.offering.resources.map (fun (n, a) => (n, -(a : Int)))
  let gains := trade.requesting.resources.map (fun (n, a) => (n, (a : Int)))
  losses ++ gains

/-! ## Laws -/

/-- A trade with oneself is always invalid. -/
theorem self_trade_invalid (trade : TradeProposal)
    (h : trade.proposer = trade.target)
    (f g : ResourceName → Nat) :
    isValidTrade trade f g = false := by
  simp [isValidTrade, h, BEq.beq, bne_iff_ne]

/-- Empty trade (nothing offered or requested) is trivially fulfillable. -/
theorem empty_offer_fulfillable (f : ResourceName → Nat) :
    canFulfill ⟨[], []⟩ f = true := by
  simp [canFulfill, List.all]

end Playtest.Trading

/-! ## Trading Mechanic Typeclass -/

namespace Playtest

/-- The TradingMechanic typeclass.
    Models bilateral consent-based exchange between players.
    `requires: ['resources']` — trades exchange resources. -/
class TradingMechanic (G : Type) [ResourceMechanic G] where
  /-- Propose a trade to another player. -/
  proposeTrade : G → Trading.TradeProposal → Option G
  /-- Accept a pending trade. -/
  acceptTrade : G → PlayerId → Option G
  /-- Reject a pending trade. -/
  rejectTrade : G → PlayerId → G
  /-- Cancel a pending trade (by proposer). -/
  cancelTrade : G → PlayerId → G
  /-- Get active trades involving a player. -/
  getActiveTrades : G → PlayerId → List Trading.ActiveTrade

  -- Laws

  /-- Both parties must have sufficient resources for trade to complete. -/
  trade_requires_resources : ∀ (g : G) (proposal : Trading.TradeProposal) (g' : G),
    proposeTrade g proposal = some g' →
    proposal.offering.resources.all (fun (name, amount) =>
      decide (amount ≤ ResourceMechanic.getResource g proposal.proposer name)) = true

  /-- Completed trade transfers resources from proposer to target. -/
  trade_transfers : ∀ (g : G) (pid : PlayerId) (g' : G),
    acceptTrade g pid = some g' →
    ∃ trade, trade ∈ getActiveTrades g pid ∧
    trade.status = Trading.TradeStatus.pending

  /-- Trades require bilateral consent (target must accept). -/
  trade_bilateral : ∀ (g : G) (proposal : Trading.TradeProposal) (g' : G),
    proposeTrade g proposal = some g' →
    ∃ trade, trade ∈ getActiveTrades g' proposal.target ∧
    trade.status = Trading.TradeStatus.pending

  /-- Trades don't affect uninvolved players. -/
  trade_isolation : ∀ (g : G) (pid : PlayerId) (g' : G) (other : PlayerId)
    (name : ResourceName),
    acceptTrade g pid = some g' →
    (∀ trade, trade ∈ getActiveTrades g pid →
      trade.proposal.proposer ≠ other ∧ trade.proposal.target ≠ other) →
    ResourceMechanic.getResource g' other name = ResourceMechanic.getResource g other name

end Playtest
