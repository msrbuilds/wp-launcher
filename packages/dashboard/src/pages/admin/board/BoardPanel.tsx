import { useState } from 'react';
import { Eye, EyeOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminHeaders } from '../AdminLayout';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useBoard, BoardColumn } from './useBoard';

function CardTile({ card }: { card: { id: string; title: string; due_date: string | null; labels: string } }) {
  const labels: string[] = (() => { try { return JSON.parse(card.labels); } catch { return []; } })();
  return (
    <div className="rounded-lg border border-border bg-background p-3 shadow-sm">
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

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <Input
          className="h-8 border-transparent bg-transparent font-medium"
          defaultValue={column.name}
          onBlur={(e) => e.target.value.trim() && e.target.value !== column.name
            && board.renameColumn(column.id, e.target.value)}
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

      <div className="flex flex-col gap-2">
        {column.cards.map((card) => <CardTile key={card.id} card={card} />)}
      </div>

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
        <div className="flex gap-3 overflow-x-auto pb-2">
          {board.columns.map((column) => <Column key={column.id} column={column} board={board} />)}
        </div>
      )}
    </div>
  );
}
