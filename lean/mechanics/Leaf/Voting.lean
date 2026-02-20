/-
  Leaf/Voting.lean — Voting mechanic formalization.

  No core mechanic dependency (standalone).

  Players cast votes on topics. Resolution determines outcome by
  majority, plurality, or unanimity.

  Used by: Council of Whispers, Shadow Operations.
-/

import Core.Types

namespace Playtest.Voting

open Playtest

/-! ## Vote Resolution Methods -/

/-- How votes are counted to determine the winner. -/
inductive Resolution where
  /-- Strict majority (> 50%). -/
  | majority
  /-- Most votes wins (ties possible). -/
  | plurality
  /-- All must agree. -/
  | unanimous
  deriving Repr, DecidableEq, BEq

/-! ## Voting Session -/

/-- A single vote cast by a player. -/
structure Vote where
  voter : PlayerId
  choice : String
  deriving Repr, DecidableEq, BEq

/-- A voting session. -/
structure Session where
  topic : String
  candidates : List String
  resolution : Resolution
  votes : List Vote
  eligibleVoters : List PlayerId
  deriving Repr

/-- Create a new voting session. -/
def Session.init (topic : String) (candidates : List String)
    (resolution : Resolution) (voters : List PlayerId) : Session :=
  { topic, candidates, resolution, votes := [], eligibleVoters := voters }

/-- Cast a vote (validates voter eligibility and single vote). -/
def Session.castVote (s : Session) (voter : PlayerId) (choice : String)
    : Option Session :=
  -- Must be eligible
  if !(s.eligibleVoters.any (· == voter)) then none
  -- Must not have already voted
  else if s.votes.any (fun v => v.voter == voter) then none
  -- Choice must be a valid candidate
  else if !(s.candidates.any (· == choice)) then none
  else some { s with votes := s.votes ++ [{ voter, choice }] }

/-- Check if all eligible voters have voted. -/
def Session.isComplete (s : Session) : Bool :=
  s.eligibleVoters.all (fun pid => s.votes.any (fun v => v.voter == pid))

/-! ## Vote Counting -/

/-- Count votes for each candidate. -/
def countVotes (votes : List Vote) (candidates : List String)
    : List (String × Nat) :=
  candidates.map (fun c =>
    (c, (votes.filter (fun v => v.choice == c)).length))

/-- Find the candidate(s) with the most votes. -/
def topCandidates (counts : List (String × Nat)) : List String :=
  let maxCount := counts.foldl (fun acc p => max acc p.2) 0
  (counts.filter (fun p => p.2 == maxCount)).map Prod.fst

/-! ## Resolution Logic -/

/-- Result of resolving a vote. -/
inductive VoteResult where
  /-- A clear winner. -/
  | winner (choice : String)
  /-- A tie between candidates. -/
  | tie (choices : List String)
  /-- No winner (failed to meet threshold). -/
  | noWinner
  deriving Repr

/-- Resolve a completed voting session. -/
def resolve (s : Session) : VoteResult :=
  let counts := countVotes s.votes s.candidates
  let totalVotes := s.votes.length
  match s.resolution with
  | .majority =>
    let top := topCandidates counts
    match top with
    | [c] =>
      let cCount := (counts.find? (fun p => p.1 == c)).map Prod.snd |>.getD 0
      if cCount * 2 > totalVotes then .winner c
      else .noWinner
    | _ => .noWinner
  | .plurality =>
    let top := topCandidates counts
    match top with
    | [c] => .winner c
    | cs => if cs.length > 1 then .tie cs else .noWinner
  | .unanimous =>
    match s.votes with
    | [] => .noWinner
    | first :: _ =>
      if s.votes.all (fun v => v.choice == first.choice) then .winner first.choice
      else .noWinner

/-! ## Laws -/

/-- A voter can only vote once. -/
theorem no_double_voting (s : Session) (voter : PlayerId) (c1 c2 : String)
    (s' : Session)
    (h : s.castVote voter c1 = some s') :
    s'.castVote voter c2 = none := by
  sorry

/-- Casting a vote increases the vote count by 1. -/
theorem cast_increases_count (s : Session) (voter : PlayerId) (choice : String)
    (s' : Session) (h : s.castVote voter choice = some s') :
    s'.votes.length = s.votes.length + 1 := by
  sorry

/-- Unanimous resolution requires all votes to agree. -/
theorem unanimous_requires_agreement (s : Session)
    (h : s.resolution = .unanimous)
    (v1 v2 : Vote) (hv1 : v1 ∈ s.votes) (hv2 : v2 ∈ s.votes)
    (w : String) (hw : resolve s = .winner w) :
    v1.choice = v2.choice := by
  sorry

/-- Empty session has no winner. -/
theorem empty_no_winner (topic : String) (candidates : List String)
    (resolution : Resolution) (voters : List PlayerId) :
    let s := Session.init topic candidates resolution voters
    match resolve s with
    | .winner _ => False
    | _ => True := by
  sorry

end Playtest.Voting

/-! ## Voting Mechanic Typeclass -/

namespace Playtest

/-- The VotingMechanic typeclass. Standalone (no core dependency). -/
class VotingMechanic (G : Type) where
  /-- Start a new voting session. -/
  startVote : G → String → List String → Voting.Resolution → G
  /-- Cast a vote. -/
  castVote : G → PlayerId → String → Option G
  /-- Check if voting is complete. -/
  isVoteComplete : G → Bool
  /-- Resolve the current vote. -/
  resolveVote : G → Option (G × Voting.VoteResult)
  /-- Get the current session (if any). -/
  getCurrentSession : G → Option Voting.Session

  -- Laws

  /-- Cannot vote twice. -/
  no_double_vote : ∀ (g : G) (pid : PlayerId) (c1 c2 : String) (g' : G),
    castVote g pid c1 = some g' →
    castVote g' pid c2 = none

  /-- Resolution requires a complete vote. -/
  resolve_requires_complete : ∀ (g : G),
    isVoteComplete g = false →
    resolveVote g = none

end Playtest
