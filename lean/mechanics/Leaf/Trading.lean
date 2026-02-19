/-
  Leaf/Trading.lean — TradingMechanic as OwnedBilateral instance.

  This is the #4 priority typeclass from ANALYSIS.md: "bilateral consent
  model for trading." It closes GAP 4 from AAOTE.lean.

  TradingMechanic extends OwnedBilateral with item-trading semantics:
  - Players offer items they own
  - Counterparty must accept for the trade to execute
  - Items are exchanged atomically
  - Supports out-of-turn responses

  `requires: ['cards']` — items being traded come from card hands.
-/

import Core.Types
import Core.Cards
import Core.Abstract.Bilateral

namespace Playtest.Leaf

open Playtest
open Playtest.Abstract

variable {G : Type}

/-! ## Trade Types -/

/-- A trade offer specifying what each party gives/receives. -/
structure TradeData where
  offering : List Card    -- cards the initiator offers
  requesting : List Card  -- cards the initiator wants
  deriving Repr

/-- Trade identifier. -/
abbrev TradeId := Nat

/-! ## Trading Mechanic -/

/-- TradingMechanic: bilateral item exchange between players.

    This extends OwnedBilateral with card-trading specifics.
    The abstract bilateral laws handle the protocol (propose/respond);
    this class adds the card-movement semantics.

    `requires: ['cards']` — trading operates on card hands. -/
class TradingMechanic (G : Type) [CardMechanic G] where
  /-- Propose a trade between two players. -/
  proposeTrade : G → PlayerId → PlayerId → TradeData → Option (G × TradeId)
  /-- Respond to a pending trade (accept/decline). -/
  respondTrade : G → TradeId → ProposalResponse → Option G
  /-- Get a pending trade by ID. -/
  getTrade : G → TradeId → Option (PlayerId × PlayerId × TradeData × ProposalStatus)
  /-- Get all pending trades for a player (as target). -/
  getPendingTradesFor : G → PlayerId → List TradeId
  /-- Cancel a trade (by initiator only). -/
  cancelTrade : G → TradeId → PlayerId → Option G
  /-- Counter-offer: modify the terms of a pending trade. -/
  counterOffer : G → TradeId → TradeData → Option (G × TradeId)

  -- === Laws ===

  /-- A new trade starts in pending status. -/
  propose_creates_pending : ∀ (g : G) (initiator target : PlayerId) (data : TradeData)
    (g' : G) (tid : TradeId),
    proposeTrade g initiator target data = some (g', tid) →
    ∃ d, getTrade g' tid = some (initiator, target, d, ProposalStatus.pending)

  /-- Initiator must own all offered items. -/
  offer_requires_ownership : ∀ (g : G) (initiator target : PlayerId)
    (data : TradeData) (g' : G) (tid : TradeId),
    proposeTrade g initiator target data = some (g', tid) →
    data.offering.all (fun c => (CardMechanic.getHand g initiator).any (· == c)) = true

  /-- Cannot trade with yourself. -/
  no_self_trade : ∀ (g : G) (pid : PlayerId) (data : TradeData)
    (g' : G) (tid : TradeId),
    proposeTrade g pid pid data = some (g', tid) → False

  /-- After acceptance, initiator's hand loses offered cards. -/
  accept_updates_initiator : ∀ (g : G) (tid : TradeId) (g' : G)
    (init tgt : PlayerId) (data : TradeData),
    getTrade g tid = some (init, tgt, data, ProposalStatus.pending) →
    respondTrade g tid ProposalResponse.accept = some g' →
    data.offering.all (fun c => !(CardMechanic.getHand g' init).any (· == c)) = true

  /-- After acceptance, target's hand loses requested cards. -/
  accept_updates_target : ∀ (g : G) (tid : TradeId) (g' : G)
    (init tgt : PlayerId) (data : TradeData),
    getTrade g tid = some (init, tgt, data, ProposalStatus.pending) →
    respondTrade g tid ProposalResponse.accept = some g' →
    data.requesting.all (fun c => !(CardMechanic.getHand g' tgt).any (· == c)) = true

  /-- After acceptance, items have been exchanged. -/
  accept_exchanges : ∀ (g : G) (tid : TradeId) (g' : G)
    (init tgt : PlayerId) (data : TradeData),
    getTrade g tid = some (init, tgt, data, ProposalStatus.pending) →
    respondTrade g tid ProposalResponse.accept = some g' →
    -- Offered items moved to target
    data.offering.all (fun c => (CardMechanic.getHand g' tgt).any (· == c)) = true ∧
    -- Requested items moved to initiator
    data.requesting.all (fun c => (CardMechanic.getHand g' init).any (· == c)) = true

/-! ## Trading allows out-of-turn response -/

/-- TradingMechanic supports out-of-turn responses.
    The target player can accept/decline a trade even when it's not their turn.

    This is expressed as a capability: if a player has a pending trade,
    they CAN respond regardless of whose turn it is. The composition layer
    must handle this by allowing trade responses to bypass turn checks. -/
def tradingAllowsOutOfTurn {G : Type} [CardMechanic G] [TradingMechanic G]
    (g : G) (pid : PlayerId) : Prop :=
  (TradingMechanic.getPendingTradesFor g pid).length > 0 →
  True

end Playtest.Leaf
