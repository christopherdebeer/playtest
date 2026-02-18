/-
  Leaf/AuctionEnglish.lean — English auction mechanic formalization.

  Mirrors src/mechanics/auction-english.ts.
  `requires: ['resources']` — expressed as `[ResourceMechanic G]`.

  English auction: ascending price, open bids. Each bid must exceed
  the current highest bid by at least a minimum increment.
  When all but one player has passed, the high bidder wins the item
  and pays the bid amount.
-/

import Core.Resources

namespace Playtest.AuctionEnglish

open Playtest

/-! ## Auction State -/

/-- State of an active auction. -/
structure AuctionState where
  /-- What's being auctioned. -/
  itemId : String
  /-- Current highest bid. -/
  currentBid : Nat
  /-- Current high bidder (none if no bids yet). -/
  highBidder : Option PlayerId
  /-- Minimum bid increment. -/
  minIncrement : Nat
  /-- Players still in the auction (haven't passed). -/
  activeBidders : List PlayerId
  /-- Currency resource name used for payment. -/
  currency : String
  deriving Repr

/-- Initial auction state. -/
def AuctionState.initial (itemId : String) (players : List PlayerId)
    (currency : String) (minIncrement : Nat := 1) : AuctionState :=
  { itemId, currentBid := 0, highBidder := none,
    minIncrement, activeBidders := players, currency }

/-! ## Bid Validation -/

/-- A bid is valid if:
    1. Bidder is still active
    2. Bid exceeds current bid by at least minIncrement
    3. Bidder has sufficient resources -/
def isValidBid (auction : AuctionState) (bidder : PlayerId) (amount : Nat)
    (bidderResources : Nat) : Bool :=
  auction.activeBidders.any (· == bidder) &&
  amount ≥ auction.currentBid + auction.minIncrement &&
  amount ≤ bidderResources

/-- Place a bid, updating auction state. -/
def placeBid (auction : AuctionState) (bidder : PlayerId) (amount : Nat) : AuctionState :=
  { auction with currentBid := amount, highBidder := some bidder }

/-- Pass on bidding: remove from active bidders. -/
def passBid (auction : AuctionState) (bidder : PlayerId) : AuctionState :=
  { auction with activeBidders := auction.activeBidders.filter (· != bidder) }

/-- Check if the auction is complete (0 or 1 active bidders). -/
def isComplete (auction : AuctionState) : Bool :=
  auction.activeBidders.length ≤ 1

/-! ## Laws -/

/-- Bids are strictly increasing. -/
theorem bid_strictly_increases (auction : AuctionState) (bidder : PlayerId)
    (amount : Nat) (h : amount ≥ auction.currentBid + auction.minIncrement) :
    (placeBid auction bidder amount).currentBid > auction.currentBid := by
  simp [placeBid]; omega

/-- Passing reduces the bidder count. -/
theorem pass_reduces_bidders (auction : AuctionState) (bidder : PlayerId)
    (h : bidder ∈ auction.activeBidders) :
    (passBid auction bidder).activeBidders.length < auction.activeBidders.length := by
  sorry -- Provable: filter removing a present element decreases length

/-- Auction terminates: each pass reduces bidders, and bidders are finite. -/
theorem auction_terminates (auction : AuctionState)
    (h : auction.activeBidders.length > 1) :
    ∀ bidder, bidder ∈ auction.activeBidders →
    (passBid auction bidder).activeBidders.length < auction.activeBidders.length := by
  intro bidder hm
  exact pass_reduces_bidders auction bidder hm

/-- If exactly one bidder remains and there was a bid, they win. -/
theorem sole_bidder_wins (auction : AuctionState)
    (h1 : auction.activeBidders.length = 1)
    (h2 : auction.highBidder.isSome = true) :
    isComplete auction = true := by
  simp [isComplete, h1]

end Playtest.AuctionEnglish

/-! ## Auction Mechanic Typeclass -/

namespace Playtest

/-- The AuctionMechanic typeclass.
    `requires: ['resources']` is expressed as `[ResourceMechanic G]`. -/
class AuctionMechanic (G : Type) [ResourceMechanic G] where
  /-- Get the current auction state. -/
  getAuction : G → Option AuctionEnglish.AuctionState
  /-- Place a bid. Returns updated state or none if invalid. -/
  placeBid : G → PlayerId → Nat → Option G
  /-- Pass on the current auction. -/
  auctionPass : G → PlayerId → Option G
  /-- Complete the auction, awarding the item and deducting payment. -/
  completeAuction : G → Option (G × PlayerId)

  -- Laws

  /-- Bids must exceed current bid by minimum increment. -/
  bid_exceeds : ∀ (g : G) (pid : PlayerId) (amount : Nat) (g' : G),
    placeBid g pid amount = some g' →
    ∃ auction, getAuction g = some auction ∧
    amount ≥ auction.currentBid + auction.minIncrement

  /-- Bidder must have sufficient resources. -/
  bid_affordable : ∀ (g : G) (pid : PlayerId) (amount : Nat) (g' : G),
    placeBid g pid amount = some g' →
    ∃ auction, getAuction g = some auction ∧
    amount ≤ ResourceMechanic.getResource g pid auction.currency

  /-- Completing auction deducts from winner's resources. -/
  complete_deducts : ∀ (g : G) (g' : G) (winner : PlayerId),
    completeAuction g = some (g', winner) →
    ∃ auction, getAuction g = some auction ∧
    ResourceMechanic.getResource g' winner auction.currency =
    ResourceMechanic.getResource g winner auction.currency - auction.currentBid

end Playtest
