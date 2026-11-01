import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '../admin/Pagination';
import { apiFetch } from '../../utils/api';
import { formatWhen } from './ConnectedAppsCard';

interface AuditRow {
  id: string;
  clientId: string;
  clientName: string | null;
  tool: string;
  outcome: 'ok' | 'error' | 'denied';
  error: string | null;
  durationMs: number;
  createdAt: string;
}

const PAGE_SIZE = 20;
const OUTCOME_VARIANT = { ok: 'secondary', error: 'outline', denied: 'destructive' } as const;

/** What the user's own agents did, newest first. Never another user's rows. */
export default function AgentActivityCard() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [outcome, setOutcome] = useState('all');

  useEffect(() => {
    const q = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (outcome !== 'all') q.set('outcome', outcome);
    apiFetch(`/api/oauth/audit?${q}`).then((r) => r.json()).then((d) => { setRows(d.rows ?? []); setTotal(d.total ?? 0); }).catch(() => setRows([]));
  }, [page, outcome]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Agent activity</CardTitle>
          <CardDescription>Every tool your AI agents called, kept for 90 days.</CardDescription>
        </div>
        <Select value={outcome} onValueChange={(v) => { setOutcome(v); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="ok">Succeeded</SelectItem>
            <SelectItem value="error">Failed</SelectItem>
            <SelectItem value="denied">Refused</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {rows === null && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {rows?.length === 0 && <p className="text-sm text-muted-foreground">No agent activity yet.</p>}
        {!!rows?.length && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>App</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatWhen(r.createdAt)}</TableCell>
                    <TableCell className="max-w-40 truncate" title={r.clientName ?? r.clientId}>{r.clientName ?? r.clientId}</TableCell>
                    <TableCell className="font-mono text-xs">{r.tool}</TableCell>
                    <TableCell title={r.error ?? undefined}>
                      <Badge variant={OUTCOME_VARIANT[r.outcome]}>{r.outcome}</Badge>
                      <span className="ml-2 text-xs text-muted-foreground">{r.durationMs} ms</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
