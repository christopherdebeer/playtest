/-
  Core/Types.lean — Foundational types for the Playtest mechanic algebra.

  These mirror the TypeScript types in src/types/game.ts and src/mechanics/types.ts.
  Every mechanic operates over these shared domains.
-/

namespace Playtest

-- Player identity
abbrev PlayerId := String

-- Named string identifiers used throughout
abbrev ResourceName := String
abbrev EffectType := String
abbrev StateName := String
abbrev CardName := String

/-! ## Cards -/

/-- A card suit (for trick-taking and similar). -/
structure Suit where
  name : String
  deriving Repr, DecidableEq, BEq, Hashable

/-- A card in the game. Mirrors the TypeScript `Card` interface. -/
structure Card where
  name : CardName
  cardType : String
  suit : Option Suit := none
  value : Option Nat := none
  deriving Repr, DecidableEq, BEq

/-- The zones where a card can reside. -/
inductive Zone where
  | deck : Zone
  | hand : PlayerId → Zone
  | discard : Zone
  | tableau : PlayerId → Zone
  | trash : Zone
  | supply : Zone              -- for deck-building supply piles
  | personalDeck : PlayerId → Zone
  | personalDiscard : PlayerId → Zone
  deriving Repr, DecidableEq, BEq

/-! ## Effects -/

/-- A timed modifier on a player. Duration 0 means permanent. -/
structure Effect where
  effectType : EffectType
  value : Int := 0
  duration : Nat := 0          -- 0 = permanent
  source : Option PlayerId := none
  deriving Repr, DecidableEq, BEq

/-! ## Actions -/

/-- Game actions that players can take. Mirrors TypeScript `GameAction`. -/
inductive Action where
  | draw (count : Nat := 1)
  | playCard (card : CardName) (target : Option PlayerId := none)
  | move (toState : StateName)
  | spend (resource : ResourceName) (amount : Nat) (target : Option String := none)
  | bid (amount : Nat)
  | auctionPass
  | placeWorker (spaceId : String) (workerId : Option String := none)
  | pass
  | custom (actionType : String)
  deriving Repr, DecidableEq, BEq

/-! ## Validation -/

/-- Result of action validation. -/
inductive ValidationResult where
  | valid : ValidationResult
  | invalid (reason : String) : ValidationResult
  deriving Repr, DecidableEq

def ValidationResult.isValid : ValidationResult → Bool
  | .valid => true
  | .invalid _ => false

/-! ## Hook Resolution Strategies -/

/-- How multiple mechanic hooks are combined.
    Mirrors the resolution strategies in registry.ts. -/
inductive HookResolution where
  | blocking   -- First mechanic returning blocked stops the chain
  | merge      -- All results are merged (state changes combined)
  | first      -- First non-null result wins
  deriving Repr, DecidableEq

end Playtest
