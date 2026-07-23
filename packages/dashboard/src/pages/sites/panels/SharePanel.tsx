import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { SharesController } from '../hooks/useShares';
import { ShareRole } from '../types';

interface Props {
  siteId: string;
  shares: SharesController;
}

export default function SharePanel({ siteId, shares }: Props) {
  const list = shares.bySite[siteId] || [];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="email"
          placeholder="user@example.com"
          value={shares.email}
          onChange={(e) => shares.setEmail(e.target.value)}
          className="h-8 max-w-xs rounded-lg text-sm"
        />
        <Select value={shares.role} onValueChange={(v) => shares.setRole(v as ShareRole)}>
          <SelectTrigger size="sm" className="w-32 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
        <Button size="xs" onClick={() => shares.share(siteId)} disabled={shares.loading || !shares.email}>
          {shares.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Share'}
        </Button>
      </div>

      {shares.message && (
        <div
          className={cn(
            'mt-2 text-sm',
            shares.message.includes('success') ? 'text-emerald-600' : 'text-destructive',
          )}
        >
          {shares.message}
        </div>
      )}

      {list.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {list.map((s: any) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                {s.shared_with_email}
                <Badge variant="secondary">{s.role}</Badge>
                <span
                  className={cn(
                    'text-xs',
                    s.status === 'accepted' ? 'text-emerald-600' : 'text-amber-600',
                  )}
                >
                  {s.status}
                </span>
              </span>
              <Button variant="destructive" size="xs" onClick={() => shares.revoke(siteId, s.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No shares yet. Enter an email above to share this site.
        </p>
      )}
    </>
  );
}
