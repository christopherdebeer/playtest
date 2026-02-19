import Lake
open Lake DSL

package «PlaytestMechanics» where
  leanOptions := #[
    ⟨`autoImplicit, false⟩
  ]
  moreLeanArgs := #["-DautoImplicit=false"]

@[default_target]
lean_lib «PlaytestMechanics» where
  srcDir := "mechanics"
  roots := #[`Core, `Leaf, `Composition, `Instances, `Games, `Engine]

lean_exe «lean-engine» where
  srcDir := "mechanics"
  root := `Engine.Main
