import { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, MessageSquare, Paperclip, Plus, Trash2 } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAdminHeaders } from '../AdminLayout';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useBoard, BoardColumn, BoardCard } from './useBoard';
import CardActivity from './CardActivity';

/** Labels are stored as a JSON string; a malformed value renders as no labels rather than throwing. */
function parseLabels(labels: string): string[] {
  try {
    const parsed = JSON.parse(labels);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function CardTile({ card, counts, onOpen }: {
  card: BoardCard;
  counts?: { comments: number; attachments: number };
  onOpen: (card: BoardCard) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const labels = parseLabels(card.labels);
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // A plain click never exceeds the pointer sensor's activation distance,
      // so it reaches this handler untouched; a real drag is claimed by the
      // sensor before release, which swallows the resulting click. Distance
      // and swallowing are dnd-kit's own doing (`activationConstraint` below).
      onClick={() => onOpen(card)}
      // dnd-kit computes a per-frame pixel translation; there is no class for it.
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`cursor-grab rounded-lg border border-border bg-background p-3 shadow-sm ${isDragging ? 'opacity-50' : ''}`}
    >
      <p className="text-sm text-foreground">{card.title}</p>
      {(labels.length > 0 || card.due_date || counts) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {labels.map((label) => (
            <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
          ))}
          {card.due_date && (
            <span className="text-xs text-muted-foreground">
              due {new Date(`${card.due_date}T00:00:00Z`).toLocaleDateString()}
            </span>
          )}
          {/* Badges rather than a count opening the card: the point is to see
              from the board which cards carry a record. */}
          {!!counts?.comments && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" />{counts.comments}
            </span>
          )}
          {!!counts?.attachments && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />{counts.attachments}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Title, description, due date and labels for one card, plus delete.
 * `open` tracks `card !== null` directly so there is nothing to resync —
 * the dialog's own fields are seeded fresh from `card` each time it opens.
 */
function CardEditorDialog({ card, board, onClose }: {
  card: BoardCard | null; board: ReturnType<typeof useBoard>; onClose: () => void;
}) {
  const confirm = useConfirm();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [labelsText, setLabelsText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title);
    setDescription(card.description || '');
    setDueDate(card.due_date || '');
    setLabelsText(parseLabels(card.labels).join(', '));
  }, [card]);

  async function handleSave() {
    if (!card || !title.trim()) return;
    setSaving(true);
    const ok = await board.editCard(card.id, {
      title: title.trim(),
      description: description.trim(),
      due_date: dueDate || null,
      labels: labelsText.split(',').map((label) => label.trim()).filter(Boolean),
    });
    setSaving(false);
    // A failed save already toasted its reason (useBoard's send()); leave the
    // dialog open with what the user typed so they can retry.
    if (ok) onClose();
  }

  async function handleDelete() {
    if (!card) return;
    const ok = await confirm({
      title: `Delete "${card.title}"?`,
      description: 'This permanently removes the card.',
      confirmText: 'Delete',
    });
    if (!ok) return;
    setSaving(true);
    const removed = await board.removeCard(card.id);
    setSaving(false);
    if (removed) onClose();
  }

  return (
    <Dialog open={card !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Card</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="card-title">Title *</Label>
          <Input id="card-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="card-description">Description</Label>
          <Textarea id="card-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="grid min-w-32 flex-1 gap-2">
            <Label htmlFor="card-due">Due date</Label>
            <Input id="card-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="grid min-w-48 flex-1 gap-2">
            <Label htmlFor="card-labels">Labels</Label>
            <Input
              id="card-labels" placeholder="urgent, design" value={labelsText}
              onChange={(e) => setLabelsText(e.target.value)}
            />
          </div>
        </div>
        {/* Keyed on the card so switching cards remounts rather than showing
            the previous card's notes while the new ones load. */}
        {card && <CardActivity key={card.id} cardId={card.id} onChanged={board.reload} />}

        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" onClick={handleDelete} disabled={saving}>Delete</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Column({ column, board, onOpenCard }: {
  column: BoardColumn; board: ReturnType<typeof useBoard>; onOpenCard: (card: BoardCard) => void;
}) {
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
          {column.cards.map((card) => (
            <CardTile key={card.id} card={card} counts={board.activity[card.id]} onOpen={onOpenCard} />
          ))}
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
  const [editingCard, setEditingCard] = useState<BoardCard | null>(null);

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
            {board.columns.map((column) => (
              <Column key={column.id} column={column} board={board} onOpenCard={setEditingCard} />
            ))}
          </div>
        </DndContext>
      )}

      <CardEditorDialog card={editingCard} board={board} onClose={() => setEditingCard(null)} />
    </div>
  );
}
