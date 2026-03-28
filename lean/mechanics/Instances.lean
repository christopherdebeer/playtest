-- Instance derivations: connecting concrete typeclasses to abstract patterns.
--
-- These files prove that existing concrete typeclasses (ResourceMechanic,
-- BoardMechanic, CardMechanic) are instances of the abstract patterns
-- (PoolMechanic, GraphMechanic, CollectionMechanic).
--
-- This means: any game state that implements a concrete mechanic
-- automatically gets all abstract pattern theorems for free.

import Instances.ResourcePool
import Instances.BoardGraph
import Instances.CardCollection
