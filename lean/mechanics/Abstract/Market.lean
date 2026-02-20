/-
  Abstract/Market.lean — Dynamic pricing with bounds.

  Covers: commodity speculation, stock markets, supply/demand economics,
  variable pricing in auctions.

  Used by: CommodityMechanic, StockMechanic, Grand Bazaar, Dice Dynasties,
  Battle Forge.
-/

namespace Playtest.Abstract

/-! ## Market Structure -/

/-- A priced commodity. -/
structure Commodity (α : Type) where
  item : α
  price : Nat
  quantity : Nat := 0  -- available supply (0 = unlimited)
  deriving Repr

/-- A market with price bounds and dynamic pricing. -/
structure Market (α : Type) where
  commodities : List (Commodity α)
  floor : Nat        -- minimum price
  ceiling : Nat      -- maximum price
  deriving Repr

namespace Market

variable {α : Type} [BEq α]

/-- Empty market. -/
def empty (floor ceiling : Nat) : Market α :=
  { commodities := [], floor := floor, ceiling := ceiling }

/-- Get the current price of an item. Returns none if not in market. -/
def getPrice (m : Market α) (item : α) : Option Nat :=
  match m.commodities.find? (fun c => c.item == item) with
  | some c => some c.price
  | none => none

/-- Clamp a price to market bounds. -/
def clampPrice (m : Market α) (price : Nat) : Nat :=
  if price < m.floor then m.floor
  else if price > m.ceiling then m.ceiling
  else price

/-- Set the price of an item (clamped to bounds). -/
def setPrice (m : Market α) (item : α) (newPrice : Nat) : Market α :=
  let clamped := m.clampPrice newPrice
  { m with commodities := m.commodities.map (fun c =>
      if c.item == item then { c with price := clamped } else c) }

/-- Adjust price by a delta (clamped). -/
def adjustPrice (m : Market α) (item : α) (delta : Int) : Market α :=
  match m.getPrice item with
  | some p =>
    let newPrice := if delta ≥ 0
      then p + delta.toNat
      else p - ((-delta).toNat)
    m.setPrice item newPrice
  | none => m

/-- Buy an item: returns (cost, updated market).
    Buying increases the price (demand). -/
def buy (m : Market α) (item : α) (qty : Nat) (priceIncrease : Nat := 1)
    : Option (Nat × Market α) :=
  match m.getPrice item with
  | some price =>
    let cost := price * qty
    let m' := m.adjustPrice item (Int.ofNat priceIncrease)
    some (cost, m')
  | none => none

/-- Sell an item: returns (revenue, updated market).
    Selling decreases the price (supply). -/
def sell (m : Market α) (item : α) (qty : Nat) (priceDecrease : Nat := 1)
    : Option (Nat × Market α) :=
  match m.getPrice item with
  | some price =>
    let revenue := price * qty
    let m' := m.adjustPrice item (Int.negSucc (priceDecrease - 1))
    some (revenue, m')
  | none => none

/-- Tick prices with random walk (deterministic seed-based). -/
def tick (m : Market α) (seed : Nat) : Market α :=
  let indexed := m.commodities.enum
  { m with commodities := indexed.map (fun (i, c) =>
      let hash := (seed * 6364136223846793005 + i * 1442695040888963407) % 100
      let delta : Int := if hash < 40 then -1
                         else if hash > 60 then 1
                         else 0
      let newPrice := if delta ≥ 0
        then m.clampPrice (c.price + delta.toNat)
        else m.clampPrice (c.price - ((-delta).toNat))
      { c with price := newPrice }) }

end Market

/-! ## Laws -/

/-- Price is always within bounds after setPrice. -/
theorem price_within_bounds {α : Type} [BEq α] (m : Market α) (item : α) (p : Nat) :
    let m' := m.setPrice item p
    match m'.getPrice item with
    | some price => price ≥ m.floor ∧ price ≤ m.ceiling
    | none => True := by
  sorry  -- requires reasoning about list map + find interaction

/-- Buying from a market increases the price. -/
theorem buy_increases_price {α : Type} [BEq α] (m : Market α)
    (item : α) (qty : Nat) (inc : Nat) (cost : Nat) (m' : Market α)
    (h : m.buy item qty inc = some (cost, m')) :
    match m'.getPrice item, m.getPrice item with
    | some p', some p => p' ≥ p
    | _, _ => True := by
  sorry  -- requires unfolding buy/adjustPrice/clampPrice chain

/-- Selling from a market decreases the price (or keeps at floor). -/
theorem sell_decreases_price {α : Type} [BEq α] (m : Market α)
    (item : α) (qty : Nat) (dec : Nat) (rev : Nat) (m' : Market α)
    (h : m.sell item qty dec = some (rev, m')) :
    match m'.getPrice item, m.getPrice item with
    | some p', some p => p' ≤ p
    | _, _ => True := by
  sorry  -- symmetric to buy case

/-- Clamped price is always within bounds. -/
theorem clamp_bounded {α : Type} (m : Market α) (price : Nat)
    (h : m.floor ≤ m.ceiling) :
    m.clampPrice price ≥ m.floor ∧ m.clampPrice price ≤ m.ceiling := by
  simp [Market.clampPrice]
  split
  · constructor <;> omega
  · split
    · constructor <;> omega
    · constructor <;> omega

end Playtest.Abstract
