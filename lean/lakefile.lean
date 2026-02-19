import Lake
open Lake DSL

package «PlaytestMechanics» where
  leanOptions := #[
    ⟨`autoImplicit, false⟩
  ]

@[default_target]
lean_lib «PlaytestMechanics» where
  srcDir := "mechanics"
  roots := #[`Core, `Leaf, `Composition, `Instances, `Games]
