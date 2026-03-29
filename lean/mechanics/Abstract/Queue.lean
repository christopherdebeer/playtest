/-
  Abstract/Queue.lean — FIFO queue with optional capacity.

  Covers: action queues, spell queues, command queues,
  event queues, message queues.

  Used by: ActionQueueMechanic, Spellbook Showdown.
-/

namespace Playtest.Abstract

/-! ## Queue Structure -/

/-- A FIFO queue with optional capacity limit. -/
structure Queue (α : Type) where
  items : List α
  /-- Maximum capacity (0 = unlimited). -/
  capacity : Nat := 0
  deriving Repr

namespace Queue

variable {α : Type}

/-- Empty queue with given capacity. -/
def empty (capacity : Nat := 0) : Queue α :=
  { items := [], capacity := capacity }

/-- Number of items in the queue. -/
def size (q : Queue α) : Nat :=
  q.items.length

/-- Check if the queue is empty. -/
def isEmpty (q : Queue α) : Bool :=
  q.items.length == 0

/-- Check if the queue is full (only meaningful with capacity > 0). -/
def isFull (q : Queue α) : Bool :=
  q.capacity > 0 && q.items.length ≥ q.capacity

/-- Enqueue an item (add to back). Returns none if full. -/
def enqueue (q : Queue α) (item : α) : Option (Queue α) :=
  if q.isFull then none
  else some { q with items := q.items ++ [item] }

/-- Dequeue an item (remove from front). Returns none if empty. -/
def dequeue (q : Queue α) : Option (Queue α × α) :=
  match q.items with
  | [] => none
  | h :: t => some ({ q with items := t }, h)

/-- Peek at the front item without removing. -/
def peek (q : Queue α) : Option α :=
  q.items.head?

/-- Clear all items from the queue. -/
def clear (q : Queue α) : Queue α :=
  { q with items := [] }

/-- Process all items in order, applying a function and collecting results. -/
def processAll {β : Type} (q : Queue α) (f : α → β) : List β × Queue α :=
  (q.items.map f, q.clear)

end Queue

/-! ## Laws -/

/-- Enqueueing increases size by 1. -/
theorem enqueue_increases {α : Type} (q : Queue α) (item : α) (q' : Queue α)
    (h : q.enqueue item = some q') :
    q'.size = q.size + 1 := by
  sorry

/-- Dequeueing decreases size by 1. -/
theorem dequeue_decreases {α : Type} (q : Queue α) (q' : Queue α) (item : α)
    (h : q.dequeue = some (q', item)) :
    q'.size = q.size - 1 := by
  sorry

/-- Enqueue then dequeue returns the same item (FIFO for a single item). -/
theorem enqueue_dequeue_single {α : Type} [BEq α] (item : α) :
    let q := Queue.empty (α := α)
    match q.enqueue item with
    | some q' =>
      match q'.dequeue with
      | some (_, item') => item' = item
      | none => False
    | none => False := by
  simp [Queue.empty, Queue.enqueue, Queue.isFull, Queue.dequeue]

/-- Full queue rejects enqueue. -/
theorem full_rejects {α : Type} (q : Queue α) (item : α)
    (h : q.isFull = true) :
    q.enqueue item = none := by
  simp [Queue.enqueue, h]

/-- Empty queue has size 0. -/
theorem empty_size {α : Type} (cap : Nat) :
    (Queue.empty (α := α) cap).size = 0 := by
  simp [Queue.empty, Queue.size]

/-- Clear produces empty queue. -/
theorem clear_empties {α : Type} (q : Queue α) :
    (q.clear).isEmpty = true := by
  simp [Queue.clear, Queue.isEmpty]

/-- Process all produces exactly size results. -/
theorem process_all_count {α β : Type} (q : Queue α) (f : α → β) :
    (q.processAll f).1.length = q.size := by
  simp [Queue.processAll, Queue.size]

end Playtest.Abstract
