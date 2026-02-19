-- Core mechanics: the foundational algebra for game mechanics.
-- Each core mechanic is a typeclass with operations and laws.
-- Leaf mechanics constrain on these typeclasses via `requires`.
--
-- Layer 0: Concrete typeclasses (mirror TypeScript src/mechanics/core/)
-- Layer 1: Abstract patterns (capture structural patterns shared by mechanics)

import Core.Types
import Core.Resources
import Core.Cards
import Core.Board
import Core.Turns
import Core.Effects
import Core.Dice
import Core.Visibility
import Core.Abstract
