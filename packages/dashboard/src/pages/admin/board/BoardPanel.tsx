import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor,
  closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminHeaders } from '../AdminLayout';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useBoard, BoardColumn } from './useBoard';

function CardTile({ card }: { card: { id: string; title: string; due_date: string | null; labels: string } }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const labels: string[] = (() => {
    try {
      const parsed = JSON.parse(card.labels);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // dnd-kit computes a per-frame pixel translation; there is no class for it.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm text-foreground">{card.title}</p>
      {(labels.length > 0 || card.due_date) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
          ))}
          {card.due_date && (
            <span className="text-xs text-muted-foreground">
              due {new Date(`${card.due_date}T00:00:00Z`).toLocaleDateString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Column({ column, board }: { column: BoardColumn; board: ReturnType<typeof useBoard> }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [name, setName] = useState(column.name);
  // Registers the whole column (not just the card list) as a drop target,
  // so a card can be dropped into an empty column.
  const { setNodeRef: setDropRef } = useDroppable({ id: `column:${column.id}` });

  // Re-sync the field whenever the server's name actually changes (e.g. a
  // successful rename lands after a reload). This never fires mid-keystroke,
  // since typing only touches local `name` state, not the `column` prop.
  useEffect(() => { setName(column.name); }, [column.name]);

  return (
    <div ref={setDropRef} className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="h-8 border-transparent bg-transparent font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={async (e) => {
            const trimmed = e.target.value.trim();
            // No real edit: snap back to the committed name (covers blank/whitespace-only too).
            if (!trimmed || trimmed === column.name) { setName(column.name); return; }
            // `column.name` here is the pre-edit value from this render's closure — exactly
            // what a rejected rename should fall back to, since the server never changed it.
            const ok = await board.renameColumn(column.id, trimmed);
            if (!ok) setName(column.name);
          }}
        />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost" size="icon"
            title={column.client_visible ? 'Visible to the client' : 'Hidden from the client'}
            onClick={() => board.setColumnVisibility(column.id, column.client_visible !== 1)}
          >
            {column.client_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost" size="icon"
            onClick={async () => {
              const ok = await confirm({
                title: `Delete "${column.name}"?`,
                description: column.cards.length
                  ? `This also deletes ${column.cards.length} card(s) in it.`
                  : 'This column is empty.',
                confirmText: 'Delete',
              });
              if (ok) board.removeColumn(column.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SortableContext items={column.cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-[3rem] flex-col gap-2">
          {column.cards.map((card) => <CardTile key={card.id} card={card} />)}
        </div>
      </SortableContext>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          board.addCard(column.id, title.trim());
          setTitle('');
        }}
      >
        <Input className="h-8" placeholder="Add a card" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" size="icon" variant="secondary" disabled={!title.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export default function BoardPanel({ projectId }: { projectId: string }) {
  const headers = useAdminHeaders();
  const board = useBoard(projectId, headers);
  const [newColumn, setNewColumn] = useState('');

  const sensors = useSensors(
    // A `distance` threshold keeps a plain click from being interpreted as a
    // drag, which would otherwise make the card's own controls unresponsive.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Keyboard operability is the whole reason for dnd-kit over native HTML5
    // drag events, which cannot be driven without a mouse.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const cardId = String(active.id);
    const overId = String(over.id);

    // Dropped on empty space in a column: the droppable id carries the column.
    if (overId.startsWith('column:')) {
      const toColumnId = overId.slice('column:'.length);
      const target = board.columns.find((c) => c.id === toColumnId);
      if (!target) return;
      const alreadyThere = target.cards.some((c) => c.id === cardId);
      if (alreadyThere && target.cards[target.cards.length - 1]?.id === cardId) return;
      board.moveCardTo(cardId, toColumnId, target.cards.length);
      return;
    }

    // Dropped on another card: take that card's column and index.
    const destination = board.columns.find((c) => c.cards.some((card) => card.id === overId));
    if (!destination) return;
    const toIndex = destination.cards.findIndex((card) => card.id === overId);
    if (overId === cardId) return;
    board.moveCardTo(cardId, destination.id, toIndex);
  }

  if (board.loading) {
    return <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading the board...
    </p>;
  }
  if (board.error) {
    return <p className="text-sm text-destructive">{board.error}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Columns are hidden from the client until you make them visible.
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (newColumn.trim()) { board.addColumn(newColumn.trim()); setNewColumn(''); } }}
        >
          <Input className="h-8 w-44" placeholder="New column" value={newColumn}
                 onChange={(e) => setNewColumn(e.target.value)} />
          <Button type="submit" size="sm" disabled={!newColumn.trim()}>Add column</Button>
        </form>
      </div>

      {board.columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No columns yet. Add one — "To do", "In progress", "Done" is a good start.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {board.columns.map((column) => <Column key={column.id} column={column} board={board} />)}
          </div>
        </DndContext>
      )}
    </div>
  );
}
