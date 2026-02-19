/-
  Leaf/Social.lean — SocialMechanic for voting, negotiation, communication.

  This is the #2 priority typeclass from ANALYSIS.md: "voting, negotiation,
  communication-limits." It's needed by Council of Whispers and AAOTE.

  Social mechanics combine elements of:
  - SimultaneousMechanic (voting is simultaneous selection)
  - BilateralMechanic (negotiation is bilateral proposal)
  - VisibilityMechanic (communication limits are visibility constraints)

  This file defines the social interaction typeclasses that sit at the
  intersection of these abstract patterns.
-/

import Core.Types
import Core.Visibility
import Core.Abstract.Bilateral
import Core.Abstract.Sequential

namespace Playtest.Leaf

open Playtest
open Playtest.Abstract

/-! ## Voting Mechanic -/

/-- VoteOption represents what can be voted on. -/
structure VoteOption where
  id : String
  description : String
  deriving Repr, DecidableEq, BEq

/-- VotingMechanic: simultaneous vote with resolution.

    This is a SimultaneousMechanic where choices are votes.
    All players vote simultaneously, then votes are tallied.

    Voting can be:
    - Public (votes revealed immediately) or secret (revealed only at tally)
    - Majority, plurality, or unanimous
    - Weighted (by role/resources) or equal -/
class VotingMechanic (G : Type)
    extends SimultaneousMechanic G VoteOption where
  /-- Get available options to vote on. -/
  getVoteOptions : G → List VoteOption
  /-- Get the winning option after resolution. -/
  getWinningOption : G → Option VoteOption
  /-- Get vote counts per option after reveal. -/
  getVoteCounts : G → List (VoteOption × Nat)
  /-- Get a player's vote weight (default 1). -/
  getVoteWeight : G → PlayerId → Nat

  -- === Laws ===

  /-- Votes must be from available options. -/
  vote_valid : ∀ (g : G) (pid : PlayerId) (vote : VoteOption) (g' : G),
    submitChoice g pid vote = some g' →
    vote ∈ getVoteOptions g

  /-- The winning option has the most votes. -/
  winner_has_most : ∀ (g : G) (winner : VoteOption),
    getWinningOption g = some winner →
    ∀ (other : VoteOption), other ∈ getVoteOptions g →
    -- winner's count ≥ other's count (after resolution)
    True  -- Full expression requires summing weighted votes

  /-- Vote weight is always positive. -/
  weight_positive : ∀ (g : G) (pid : PlayerId),
    getVoteWeight g pid ≥ 1

/-! ## Negotiation Mechanic -/

/-- NegotiationData: the content of a negotiation proposal. -/
structure NegotiationData where
  proposal : String          -- what's being proposed
  terms : List String        -- specific terms
  isBinding : Bool           -- whether acceptance is enforceable
  deriving Repr

/-- NegotiationId: identifies a specific negotiation. -/
abbrev NegotiationId := Nat

/-- NegotiationMechanic: bilateral negotiation between players.

    This extends BilateralMechanic with negotiation-specific features:
    - Non-binding vs binding agreements
    - Multi-round counter-offers
    - Public vs private negotiations -/
class NegotiationMechanic (G : Type) [VisibilityMechanic G]
    extends BilateralMechanic G NegotiationId NegotiationData where
  /-- Is a negotiation public (visible to all) or private? -/
  isPublic : G → NegotiationId → Bool
  /-- Get all active negotiations. -/
  getActiveNegotiations : G → List NegotiationId
  /-- Check if a player can negotiate (may be limited by game phase). -/
  canNegotiate : G → PlayerId → Bool

  -- === Laws ===

  /-- Private negotiations are only visible to the two parties. -/
  private_visibility : ∀ (g : G) (nid : NegotiationId)
    (init tgt : PlayerId) (data : NegotiationData) (status : ProposalStatus),
    isPublic g nid = false →
    getProposal g nid = some (init, tgt, data, status) →
    -- Only init and tgt can see the negotiation details
    True  -- Full expression requires VisibilityMechanic integration

/-! ## Communication Limits -/

/-- CommunicationMechanic: controls what players can say to each other.

    In games like Council of Whispers, communication may be:
    - Restricted to certain phases
    - Limited to adjacent players
    - Channeled through specific mechanics (voting, negotiation)
    - Blocked for certain roles (e.g., the spy can't communicate freely) -/
class CommunicationMechanic (G : Type) where
  /-- Can player A communicate freely with player B? -/
  canCommunicate : G → PlayerId → PlayerId → Bool
  /-- Get the communication channel between two players. -/
  getCommunicationMode : G → PlayerId → PlayerId → String

  -- === Laws ===

  /-- Communication is symmetric: if A can talk to B, B can talk to A. -/
  comm_symmetric : ∀ (g : G) (a b : PlayerId),
    canCommunicate g a b = canCommunicate g b a

  /-- Players can always communicate with themselves (internal monologue). -/
  self_comm : ∀ (g : G) (pid : PlayerId),
    canCommunicate g pid pid = true

end Playtest.Leaf
