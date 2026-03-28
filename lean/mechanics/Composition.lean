-- Composition layer: mechanic resolution, conflict checking,
-- and sequential hook execution with invariant preservation.
--
-- Layer 2: Strengthened composition (from ANALYSIS.md):
--   StateChanges   — formalization of Object.assign merge semantics
--                    and commutativity proofs for disjoint mechanics
--   HookChain      — hook resolution strategies with invariant preservation
--   Registry       — dependency resolution and conflict detection

import Composition.Registry
import Composition.HookChain
import Composition.StateChanges
