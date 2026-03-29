-- Leaf mechanics: concrete game mechanics built on core typeclasses.
-- Each leaf mechanic declares its dependencies via typeclass constraints,
-- mirroring the `requires: [...]` field in the TypeScript registry.

import Leaf.TrickTaking
import Leaf.AuctionEnglish
import Leaf.DeckBuilding
import Leaf.WorkerPlacement
import Leaf.WinConditions
import Leaf.SetCollection
import Leaf.CardMatching
import Leaf.Tableau
import Leaf.Contracts
import Leaf.PushYourLuck
import Leaf.Drafting
import Leaf.Voting
import Leaf.AreaControl
import Leaf.Rondel
