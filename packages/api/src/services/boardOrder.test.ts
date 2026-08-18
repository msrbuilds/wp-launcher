import { describe, it, expect } from 'vitest';
import { sequentialPositions, moveWithinList } from './boardOrder';

describe('sequentialPositions', () => {
  it('numbers a list from zero in the order given', () => {
    expect(sequentialPositions(['c', 'a', 'b'])).toEqual([
      { id: 'c', position: 0 },
      { id: 'a', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('returns nothing for an empty list', () => {
    expect(sequentialPositions([])).toEqual([]);
  });
});

describe('moveWithinList', () => {
  it('moves an item later', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves an item earlier', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('leaves the order alone when the item is already there', () => {
    expect(moveWithinList(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index past the end rather than dropping the item', () => {
    // A drop below the last card reports an index one past the end. Losing the
    // card would be worse than putting it last.
    expect(moveWithinList(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
  });

  it('clamps a negative index to the front', () => {
    expect(moveWithinList(['a', 'b'], 'b', -5)).toEqual(['b', 'a']);
  });

  it('inserts an id that was not in the list', () => {
    // Moving a card between columns: the id belongs to the destination now,
    // but was never in its order.
    expect(moveWithinList(['a', 'b'], 'new', 1)).toEqual(['a', 'new', 'b']);
  });

  it('does not mutate its input', () => {
    const original = ['a', 'b', 'c'];
    moveWithinList(original, 'a', 2);
    expect(original).toEqual(['a', 'b', 'c']);
  });
});
