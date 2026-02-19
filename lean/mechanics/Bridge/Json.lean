/-
  Bridge/Json.lean — Minimal JSON output helpers

  Hand-rolled JSON serializer for the bridge protocol.
  Avoids importing `Lean` (compiler library) to keep the executable lightweight.
  Only needs to produce output — parsing is done via CLI args.
-/
namespace Playtest.Bridge.Json

/-- Escape a string for JSON output. -/
def escapeString (s : String) : String :=
  s.toList.foldl (init := "") fun acc c =>
    acc ++ match c with
    | '"'  => "\\\""
    | '\\' => "\\\\"
    | '\n' => "\\n"
    | '\t' => "\\t"
    | c    => c.toString

/-- JSON string value: `"escaped"` -/
def str (s : String) : String :=
  "\"" ++ escapeString s ++ "\""

/-- JSON boolean: `true` or `false` -/
def bool (b : Bool) : String :=
  if b then "true" else "false"

/-- JSON number (natural) -/
def nat (n : Nat) : String :=
  toString n

/-- JSON null -/
def null : String := "null"

/-- JSON array from pre-formatted elements -/
def arr (items : List String) : String :=
  "[" ++ String.intercalate "," items ++ "]"

/-- JSON object from key-value pairs (values already formatted) -/
def obj (pairs : List (String × String)) : String :=
  let entries := pairs.map fun (k, v) => str k ++ ":" ++ v
  "{" ++ String.intercalate "," entries ++ "}"

/-- Convenience: valid response -/
def validResponse : String :=
  obj [("valid", bool true)]

/-- Convenience: invalid response with error message -/
def invalidResponse (error : String) : String :=
  obj [("valid", bool false), ("error", str error)]

/-- Convenience: win response -/
def winResponse (winner : String) (reason : String) : String :=
  obj [("won", bool true), ("winner", str winner), ("reason", str reason)]

/-- Convenience: no winner response -/
def noWinResponse : String :=
  obj [("won", bool false)]

/-- Convenience: invariant OK -/
def invariantOk : String :=
  obj [("ok", bool true)]

/-- Convenience: invariant violation -/
def invariantViolation (violation : String) : String :=
  obj [("ok", bool false), ("violation", str violation)]

end Playtest.Bridge.Json
