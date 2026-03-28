-- Abstract mechanic patterns: the foundational algebra for game mechanics.
-- Layer 1 of the generalization strategy (see ANALYSIS.md).
--
-- These typeclasses capture the structural patterns shared by many
-- concrete mechanics. Instead of formalizing 160 mechanics individually,
-- we formalize ~8 abstract patterns that cover them all.
--
-- Pattern hierarchy:
--   PoolMechanic (Pool.lean)
--     ├── ResettablePool      — pool that resets at boundaries
--     └── MonotoneCounter     — counter that only grows
--   CollectionMechanic (Collection.lean)
--     ├── ConservativeCollection — items conserved across zones
--     ├── PlayerCollection       — zones partitioned by player
--     └── BoundedCollection      — zones with capacity limits
--   GraphMechanic (Graph.lean)
--     ├── StaticGraph         — fixed topology
--     ├── DynamicGraph        — growing topology
--     ├── WeightedGraph       — edges have costs/probabilities
--     ├── UndirectedGraph     — symmetric edges
--     └── OccupancyGraph      — nodes with capacity limits
--   BilateralMechanic (Bilateral.lean)
--     ├── OwnedBilateral      — proposals involve owned items
--     └── OutOfTurnBilateral  — responder acts out of turn
--   ScoringMechanic (Scoring.lean)
--     ├── ThresholdCriterion  — first to N points
--     ├── AsymmetricScoring   — role-dependent win conditions
--     ├── DeclarationScoring  — victory requires explicit claim
--     └── TiebreakScoring     — deterministic tiebreaking
--   SequentialMechanic (Sequential.lean)
--     ├── MonotoneSequential  — actions must escalate (auctions)
--     └── TerminalSequential  — everyone acts once (trick-taking)
--   SimultaneousMechanic (Sequential.lean)
--     └── ConflictResolution  — resolve conflicting simultaneous choices

import Core.Abstract.Pool
import Core.Abstract.Collection
import Core.Abstract.Graph
import Core.Abstract.Bilateral
import Core.Abstract.Scoring
import Core.Abstract.Sequential
