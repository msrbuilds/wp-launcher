import { describe, it, expect } from 'vitest';
import { columnOf, reorderedColumnIds, cardDestination } from './dragResolve';

const board = () => [
  { id: 'todo', cards: [{ id: 'a' }, { id: 'b' }] },
  { id: 'doing', cards: [{ id: 'c' }] },
  { id: 'done', cards: [] },
];

describe('columnOf', () => {
  it('resolves a column id to itself', () => {
    expect(columnOf(board(), 'doing')?.id).toBe('doing');
  });

  it('resolves a card id to the column holding it', () => {
    expect(columnOf(board(), 'c')?.id).toBe('doing');
  });

  it('is undefined for an id belonging to neither', () => {
    expect(columnOf(board(), 'ghost')).toBeUndefined();
  });
});

describe('reorderedColumnIds', () => {
  it('moves a column later', () => {
    expect(reorderedColumnIds(board(), 'todo', 'done')).toEqual(['doing', 'done', 'todo']);
  });

  it('moves a column earlier', () => {
    expect(reorderedColumnIds(board(), 'done', 'todo')).toEqual(['done', 'todo', 'doing']);
  });

  it('accepts a drop that landed on a card in the target column', () => {
    // Columns are wide; a drag released over one almost always ends over one
    // of its cards rather than the column's own margin.
    expect(reorderedColumnIds(board(), 'done', 'a')).toEqual(['done', 'todo', 'doing']);
  });

  it('returns the whole order, since the endpoint rewrites every position', () => {
    expect(reorderedColumnIds(board(), 'doing', 'todo')).toHaveLength(3);
  });

  it('does nothing when dropped on itself', () => {
    expect(reorderedColumnIds(board(), 'todo', 'todo')).toBeNull();
    expect(reorderedColumnIds(board(), 'todo', 'a')).toBeNull();
  });

  it('does nothing for an unknown column or target', () => {
    expect(reorderedColumnIds(board(), 'ghost', 'todo')).toBeNull();
    expect(reorderedColumnIds(board(), 'todo', 'ghost')).toBeNull();
  });
});

describe('cardDestination', () => {
  it('appends when dropped on a column rather than a card', () => {
    expect(cardDestination(board(), 'a', 'done')).toEqual({ columnId: 'done', index: 0 });
    expect(cardDestination(board(), 'a', 'doing')).toEqual({ columnId: 'doing', index: 1 });
  });

  it('takes the position of the card it was dropped on', () => {
    expect(cardDestination(board(), 'c', 'a')).toEqual({ columnId: 'todo', index: 0 });
    expect(cardDestination(board(), 'c', 'b')).toEqual({ columnId: 'todo', index: 1 });
  });

  it('does not count the dragged card itself when appending within its column', () => {
    // 'a' leaving position 0 makes the end of its own column index 1, not 2.
    expect(cardDestination(board(), 'a', 'todo')).toEqual({ columnId: 'todo', index: 1 });
  });

  it('does nothing when the card is already last in the column it was dropped on', () => {
    expect(cardDestination(board(), 'b', 'todo')).toBeNull();
    expect(cardDestination(board(), 'c', 'doing')).toBeNull();
  });

  it('does nothing when dropped on itself', () => {
    expect(cardDestination(board(), 'a', 'a')).toBeNull();
  });

  it('does nothing for an unknown target', () => {
    expect(cardDestination(board(), 'a', 'ghost')).toBeNull();
  });
});
