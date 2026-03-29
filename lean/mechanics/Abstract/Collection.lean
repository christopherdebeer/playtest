/-
  Abstract.Collection — Zone-based item management

  Covers: cards in zones (hand/deck/discard), workers on spaces,
  cargo in holds, tokens on tracks, units in territories, etc.

  Any typed item that lives in a named zone and can be transferred.
-/
namespace Playtest.Abstract

structure Collection (ι ζ : Type) where
  items : List (ι × ζ) := []
  deriving Repr

namespace Collection

variable {ι ζ : Type}

def empty : Collection ι ζ := ⟨[]⟩

def inZone [BEq ζ] (coll : Collection ι ζ) (zone : ζ) : List ι :=
  (coll.items.filter (fun entry => entry.2 == zone)).map Prod.fst

def zoneOf [BEq ι] (coll : Collection ι ζ) (item : ι) : Option ζ :=
  match coll.items.find? (fun entry => entry.1 == item) with
  | some (_, z) => some z
  | none => none

def add (coll : Collection ι ζ) (item : ι) (zone : ζ) : Collection ι ζ :=
  ⟨(item, zone) :: coll.items⟩

def remove [BEq ι] (coll : Collection ι ζ) (item : ι) : Collection ι ζ :=
  ⟨coll.items.filter (fun entry => !(entry.1 == item))⟩

def transfer [BEq ι] (coll : Collection ι ζ) (item : ι) (target : ζ) : Collection ι ζ :=
  (coll.remove item).add item target

def count [BEq ζ] (coll : Collection ι ζ) (zone : ζ) : Nat :=
  (coll.inZone zone).length

def countAll (coll : Collection ι ζ) : Nat :=
  coll.items.length

end Collection

end Playtest.Abstract
