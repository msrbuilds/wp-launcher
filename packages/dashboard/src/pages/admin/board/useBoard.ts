import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../../utils/api';
import { useToast } from '../../../components/Toast';

export interface BoardCard {
  id: string; column_id: string; title: string; description: string | null;
  position: number; due_date: string | null; labels: string;
}
export interface BoardColumn {
  id: string; name: string; position: number; client_visible: number; cards: BoardCard[];
}

export function useBoard(projectId: string, headers: Record<string, string>) {
  const toast = useToast();
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/projects/list/${projectId}/board`, { headers });
      if (!res.ok) { setError('Could not load the board'); return; }
      setError('');
      setColumns((await res.json()).columns);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [projectId, headers]);

  useEffect(() => { reload(); }, [reload]);

  /** Every mutation goes through here so one failure path serves them all. */
  const send = useCallback(async (path: string, method: string, body?: unknown): Promise<boolean> => {
    try {
      const res = await apiFetch(path, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error || 'That did not save');
        await reload();
        return false;
      }
      await reload();
      return true;
    } catch {
      toast.error('Could not reach the server');
      await reload();
      return false;
    }
  }, [headers, reload, toast]);

  return {
    columns, loading, error, reload,
    addColumn: (name: string) => send(`/api/projects/list/${projectId}/board/columns`, 'POST', { name }),
    renameColumn: (columnId: string, name: string) => send(`/api/projects/board/columns/${columnId}`, 'PUT', { name }),
    setColumnVisibility: (columnId: string, client_visible: boolean) =>
      send(`/api/projects/board/columns/${columnId}`, 'PUT', { client_visible }),
    removeColumn: (columnId: string) => send(`/api/projects/board/columns/${columnId}`, 'DELETE'),
    addCard: (columnId: string, title: string) =>
      send(`/api/projects/board/columns/${columnId}/cards`, 'POST', { title }),
    editCard: (cardId: string, data: { title?: string; description?: string; due_date?: string | null; labels?: string[] }) =>
      send(`/api/projects/board/cards/${cardId}`, 'PUT', data),
    removeCard: (cardId: string) => send(`/api/projects/board/cards/${cardId}`, 'DELETE'),
    moveCardTo: (cardId: string, toColumnId: string, toIndex: number) =>
      send(`/api/projects/board/cards/${cardId}/move`, 'PUT', { toColumnId, toIndex }),
    reorderColumns: (columnIds: string[]) =>
      send(`/api/projects/list/${projectId}/board/columns/reorder`, 'PUT', { columnIds }),
  };
}
