-- Leaf mechanics: concrete game mechanics built on core typeclasses.
-- Each leaf mechanic declares its dependencies via typeclass constraints,
-- mirroring the `requires: [...]` field in the TypeScript registry.
--
-- New leaf mechanics derived from abstract patterns (Layer 1):
--   ActionPoints — ResettablePool instance (closes AAOTE GAP 1)
--   History      — MonotoneCounter instance (closes AAOTE GAP 9)
--   Trading      — OwnedBilateral instance (closes AAOTE GAP 4)
--   Social       — Voting + Negotiation + Communication

import Leaf.TrickTaking
import Leaf.AuctionEnglish
import Leaf.DeckBuilding
import Leaf.WorkerPlacement
import Leaf.WinConditions
import Leaf.ActionPoints
import Leaf.History
import Leaf.Trading
import Leaf.Social
