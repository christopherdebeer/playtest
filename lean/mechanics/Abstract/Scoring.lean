/-
  Abstract.Scoring — Win condition evaluation

  Covers: threshold victory (first to N points), highest score,
  elimination (last standing), objective completion, etc.

  Composable win-condition checks that evaluate game state.
-/
namespace Playtest.Abstract

namespace Scoring

inductive WinCheck (π : Type) where
  | noWinner : WinCheck π
  | winner : π → WinCheck π
  | draw : List π → WinCheck π
  deriving Repr

variable {π : Type}

/-- First player to reach threshold wins -/
def thresholdWin (scores : List (π × Nat)) (threshold : Nat) : WinCheck π :=
  match scores.find? (fun entry => entry.2 >= threshold) with
  | some (player, _) => .winner player
  | none => .noWinner

/-- Player with highest score wins; ties are draws -/
def highestScoreWin [BEq π] (scores : List (π × Nat)) : WinCheck π :=
  match scores with
  | [] => .noWinner
  | _ =>
    let maxScore := scores.foldl (fun m entry => max m entry.2) 0
    let winners := (scores.filter (fun entry => entry.2 == maxScore)).map Prod.fst
    match winners with
    | [p] => .winner p
    | ws => if ws.isEmpty then .noWinner else .draw ws

/-- Last player alive wins -/
def eliminationWin (alive : List π) : WinCheck π :=
  match alive with
  | [p] => .winner p
  | [] => .draw []
  | _ => .noWinner

/-- First matching condition wins (priority order) -/
def checkConditions (conditions : List (WinCheck π)) : WinCheck π :=
  match conditions.find? (fun c => match c with | .noWinner => false | _ => true) with
  | some result => result
  | none => .noWinner

end Scoring

end Playtest.Abstract
