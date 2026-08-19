/**
 * Working out what a drop meant.
 *
 * Cards and columns share one DndContext, so the id a drag ends over may be a
 * card, or a column, and it may belong to either kind of drag. Keeping that
 * resolution here — as plain functions over plain data — is what lets it be
 * tested without a pointer.
 */

export interface DragCard { id: string }
export interface DragColumn { id: string; cards: DragCard[] }

/**
 * The column an over-id refers to: the column itself, or the one holding that
 * card. Returns undefined for an id belonging to neither.
 */
export function columnOf<T extends DragColumn>(columns: T[], overId: string): T | undefined {
  return columns.find((column) => column.id === overId)
    ?? columns.find((column) => column.cards.some((card) => card.id === overId));
}

/**
 * The full column order after dropping one column on another, or null when
 * nothing would change.
 *
 * The whole order is returned rather than a from/to pair because that is what
 * the endpoint takes: it rewrites every position, so a client sending only the
 * pair could not express the result.
 */
export function reorderedColumnIds(
  columns: DragColumn[], activeId: string, overId: string,
): string[] | null {
  const from = columns.findIndex((column) => column.id === activeId);
  if (from === -1) return null;

  const target = columnOf(columns, overId);
  if (!target || target.id === activeId) return null;

  const to = columns.findIndex((column) => column.id === target.id);
  if (to === -1 || to === from) return null;

  const ids = columns.map((column) => column.id);
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}

/**
 * Where a dragged card should land, or null when nothing would change.
 *
 * Dropping on a column rather than a card means the empty space below its
 * cards, which reads as "put it at the end".
 */
export function cardDestination(
  columns: DragColumn[], cardId: string, overId: string,
): { columnId: string; index: number } | null {
  if (overId === cardId) return null;

  const onColumn = columns.find((column) => column.id === overId);
  if (onColumn) {
    const last = onColumn.cards[onColumn.cards.length - 1];
    // Already sitting at the end of that column: dropping it there again would
    // be a request that renumbers everything to the same order.
    if (last?.id === cardId) return null;
    const without = onColumn.cards.filter((card) => card.id !== cardId);
    return { columnId: onColumn.id, index: without.length };
  }

  const destination = columns.find((column) => column.cards.some((card) => card.id === overId));
  if (!destination) return null;
  return { columnId: destination.id, index: destination.cards.findIndex((card) => card.id === overId) };
}
