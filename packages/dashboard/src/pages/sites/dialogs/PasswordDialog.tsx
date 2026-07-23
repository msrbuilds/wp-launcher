import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PASSWORD_SCOPES } from '../types';
import { SiteToolsController } from '../hooks/useSiteTools';

export default function PasswordDialog({ tools }: { tools: SiteToolsController }) {
  const siteId = tools.passwordSiteId;

  return (
    <Dialog open={!!siteId} onOpenChange={(open) => { if (!open) tools.closePasswordDialog(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Password Protection</DialogTitle>
          <DialogDescription>
            Set a password to restrict access. Choose what to protect.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {PASSWORD_SCOPES.map((opt) => {
            const selected = tools.passwordScope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => tools.setPasswordScope(opt.value)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                  selected
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border bg-card hover:bg-accent/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    selected ? 'border-primary' : 'border-border',
                  )}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span>
                  <span className={cn('block text-sm font-semibold', selected ? 'text-primary' : 'text-foreground')}>
                    {opt.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{opt.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        <Input
          className="rounded-lg"
          type="text"
          placeholder="Enter password (min 4 chars)"
          value={tools.passwordValue}
          onChange={(e) => tools.setPasswordValue(e.target.value)}
        />

        <DialogFooter className="sm:justify-start">
          <Button
            size="sm"
            onClick={() => siteId && tools.setPassword(siteId)}
            disabled={tools.passwordLoadingId === siteId || tools.passwordValue.length < 4}
          >
            {tools.passwordLoadingId === siteId
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Setting...</>
              : 'Set Password'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => { if (siteId) tools.removePassword(siteId); tools.closePasswordDialog(); }}
          >
            Remove
          </Button>
          <Button variant="outline" size="sm" onClick={tools.closePasswordDialog}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
