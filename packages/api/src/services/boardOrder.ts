/**
 * Ordering arithmetic for the project board.
 *
 * Positions are contiguous integers from zero, rewritten for every affected
 * column on each move. Fractional positions avoid the rewrite but accumulate
 * precision debt and eventually need rebalancing; a board holds tens of cards,
 * where rewriting a column is trivial and always correct.
 */

/** Assign 0..n-1 to ids in the order given. */
export function sequentialPositions(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, position) => ({ id, position }));
}

/**
 * Place `id` at `toIndex` within `ids`, returning a new array.
 *
 * The index is clamped rather than validated: a drop below the last card
 * reports one past the end, and a card that vanished because the UI reported an
 * out-of-range index would be a far worse outcome than one placed last. An id
 * absent from the list is inserted, which is what a move between columns looks
 * like from the destination's side.
 */
export function moveWithinList(ids: string[], id: string, toIndex: number): string[] {
  const without = ids.filter((existing) => existing !== id);
  const index = Math.max(0, Math.min(toIndex, without.length));
  return [...without.slice(0, index), id, ...without.slice(index)];
}
