/-
  Bridge/JsonParser.lean — Minimal JSON parser for the Lean game bridge

  Parses JSON from stdin so the Lean engine can receive full game state
  from the TypeScript runtime. Keeps the binary lightweight by avoiding
  the full Lean compiler JSON library.
-/
namespace Playtest.Bridge.JsonParser

/-- JSON value type -/
inductive JsonValue where
  | null : JsonValue
  | bool : Bool → JsonValue
  | num : Int → JsonValue
  | str : String → JsonValue
  | arr : List JsonValue → JsonValue
  | obj : List (String × JsonValue) → JsonValue
  deriving Repr, Inhabited

namespace JsonValue

def getString : JsonValue → Option String
  | .str s => some s
  | _ => none

def getBool : JsonValue → Option Bool
  | .bool b => some b
  | _ => none

def getNum : JsonValue → Option Int
  | .num n => some n
  | _ => none

def getNat : JsonValue → Option Nat
  | .num n => if n >= 0 then some n.toNat else none
  | _ => none

def getArr : JsonValue → Option (List JsonValue)
  | .arr a => some a
  | _ => none

def getObj : JsonValue → Option (List (String × JsonValue))
  | .obj o => some o
  | _ => none

/-- Look up a field in a JSON object -/
def field (v : JsonValue) (key : String) : Option JsonValue :=
  match v with
  | .obj pairs => (pairs.find? (fun p => p.1 == key)).map Prod.snd
  | _ => none

/-- Get a string field from a JSON object -/
def fieldStr (v : JsonValue) (key : String) : Option String :=
  (v.field key).bind getString

/-- Get a nat field from a JSON object -/
def fieldNat (v : JsonValue) (key : String) : Option Nat :=
  (v.field key).bind getNat

/-- Get an int field from a JSON object -/
def fieldInt (v : JsonValue) (key : String) : Option Int :=
  (v.field key).bind getNum

/-- Get an array field from a JSON object -/
def fieldArr (v : JsonValue) (key : String) : Option (List JsonValue) :=
  (v.field key).bind getArr

/-- Get a bool field with default -/
def fieldBoolD (v : JsonValue) (key : String) (default : Bool) : Bool :=
  match (v.field key).bind getBool with
  | some b => b
  | none => default

/-- Get a string array field -/
def fieldStrArr (v : JsonValue) (key : String) : List String :=
  match v.fieldArr key with
  | some items => items.filterMap getString
  | none => []

end JsonValue

/-- Parser state: remaining input characters and position -/
structure ParseState where
  input : List Char
  pos : Nat := 0
  deriving Repr

/-- Parser monad -/
abbrev Parser := ParseState → Option (JsonValue × ParseState)

/-- Skip whitespace -/
partial def skipWs (s : ParseState) : ParseState :=
  match s.input with
  | ' ' :: rest | '\n' :: rest | '\r' :: rest | '\t' :: rest =>
    skipWs { input := rest, pos := s.pos + 1 }
  | _ => s

/-- Peek at next non-whitespace char -/
def peekChar (s : ParseState) : Option Char :=
  let s := skipWs s
  s.input.head?

/-- Consume expected character -/
def expectChar (s : ParseState) (c : Char) : Option ParseState :=
  let s := skipWs s
  match s.input with
  | ch :: rest => if ch == c then some { input := rest, pos := s.pos + 1 } else none
  | [] => none

/-- Parse a JSON string (after opening quote) -/
partial def parseStringChars (s : ParseState) (acc : List Char) : Option (String × ParseState) :=
  match s.input with
  | [] => none
  | '"' :: rest => some (⟨acc.reverse⟩, { input := rest, pos := s.pos + 1 })
  | '\\' :: '"' :: rest => parseStringChars { input := rest, pos := s.pos + 2 } ('"' :: acc)
  | '\\' :: '\\' :: rest => parseStringChars { input := rest, pos := s.pos + 2 } ('\\' :: acc)
  | '\\' :: 'n' :: rest => parseStringChars { input := rest, pos := s.pos + 2 } ('\n' :: acc)
  | '\\' :: 't' :: rest => parseStringChars { input := rest, pos := s.pos + 2 } ('\t' :: acc)
  | '\\' :: '/' :: rest => parseStringChars { input := rest, pos := s.pos + 2 } ('/' :: acc)
  | c :: rest => parseStringChars { input := rest, pos := s.pos + 1 } (c :: acc)

def parseString (s : ParseState) : Option (String × ParseState) :=
  let s := skipWs s
  match s.input with
  | '"' :: rest => parseStringChars { input := rest, pos := s.pos + 1 } []
  | _ => none

/-- Parse a number (integers only, sufficient for game state) -/
def parseNumber (s : ParseState) : Option (Int × ParseState) :=
  let s := skipWs s
  let (neg, input, pos) := match s.input with
    | '-' :: rest => (true, rest, s.pos + 1)
    | input => (false, input, s.pos)
  let rec go (chars : List Char) (acc : List Char) (pos : Nat) : Option (Int × ParseState) :=
    match chars with
    | c :: rest =>
      if c.isDigit then go rest (c :: acc) (pos + 1)
      else
        if acc.isEmpty then none
        else
          let n := (⟨acc.reverse⟩ : String).toNat!
          let v : Int := if neg then -n else n
          some (v, { input := c :: rest, pos := pos })
    | [] =>
      if acc.isEmpty then none
      else
        let n := (⟨acc.reverse⟩ : String).toNat!
        let v : Int := if neg then -n else n
        some (v, { input := [], pos := pos })
  go input [] pos

/-- Parse a JSON value -/
partial def parseValue (s : ParseState) : Option (JsonValue × ParseState) :=
  let s := skipWs s
  match s.input with
  | [] => none
  | '"' :: _ =>
    match parseString s with
    | some (str, s') => some (.str str, s')
    | none => none
  | 'n' :: 'u' :: 'l' :: 'l' :: rest =>
    some (.null, { input := rest, pos := s.pos + 4 })
  | 't' :: 'r' :: 'u' :: 'e' :: rest =>
    some (.bool true, { input := rest, pos := s.pos + 4 })
  | 'f' :: 'a' :: 'l' :: 's' :: 'e' :: rest =>
    some (.bool false, { input := rest, pos := s.pos + 5 })
  | '[' :: rest =>
    parseArray { input := rest, pos := s.pos + 1 } []
  | '{' :: rest =>
    parseObject { input := rest, pos := s.pos + 1 } []
  | '-' :: _ =>
    match parseNumber s with
    | some (n, s') => some (.num n, s')
    | none => none
  | c :: _ =>
    if c.isDigit then
      match parseNumber s with
      | some (n, s') => some (.num n, s')
      | none => none
    else none
where
  parseArray (s : ParseState) (acc : List JsonValue) : Option (JsonValue × ParseState) :=
    let s := skipWs s
    match s.input with
    | ']' :: rest => some (.arr acc.reverse, { input := rest, pos := s.pos + 1 })
    | _ =>
      if !acc.isEmpty then
        match expectChar s ',' with
        | some s' =>
          match parseValue s' with
          | some (v, s'') => parseArray s'' (v :: acc)
          | none => none
        | none => none
      else
        match parseValue s with
        | some (v, s') => parseArray s' (v :: acc)
        | none => none
  parseObject (s : ParseState) (acc : List (String × JsonValue)) : Option (JsonValue × ParseState) :=
    let s := skipWs s
    match s.input with
    | '}' :: rest => some (.obj acc.reverse, { input := rest, pos := s.pos + 1 })
    | _ =>
      if !acc.isEmpty then
        match expectChar s ',' with
        | some s' =>
          match parseString s' with
          | some (key, s'') =>
            match expectChar s'' ':' with
            | some s''' =>
              match parseValue s''' with
              | some (val, s4) => parseObject s4 ((key, val) :: acc)
              | none => none
            | none => none
          | none => none
        | none => none
      else
        match parseString s with
        | some (key, s') =>
          match expectChar s' ':' with
          | some s'' =>
            match parseValue s'' with
            | some (val, s''') => parseObject s''' ((key, val) :: acc)
            | none => none
          | none => none
        | none => none

/-- Parse a JSON string into a JsonValue -/
def parse (input : String) : Option JsonValue :=
  match parseValue { input := input.toList, pos := 0 } with
  | some (v, _) => some v
  | none => none

end Playtest.Bridge.JsonParser
