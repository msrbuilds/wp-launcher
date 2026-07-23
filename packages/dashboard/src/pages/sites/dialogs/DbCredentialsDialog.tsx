import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SiteToolsController } from '../hooks/useSiteTools';

export default function DbCredentialsDialog({ tools }: { tools: SiteToolsController }) {
  const db = tools.dbModal;

  return (
    <Dialog open={!!db} onOpenChange={(open) => { if (!open) tools.closeDbModal(); }}>
      <DialogContent>
        {db && (
          <>
            <DialogHeader>
              <DialogTitle>Database Credentials</DialogTitle>
              <DialogDescription>
                {db.site.subdomain} &mdash; {db.dbEngine.toUpperCase()}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              {[
                { label: 'Server', value: db.host, key: 'host' },
                { label: 'Username', value: db.user, key: 'user' },
                { label: 'Password', value: db.password, key: 'password' },
                { label: 'Database', value: db.database, key: 'database' },
              ].map((field) => (
                <div key={field.key} className="flex items-center gap-2">
                  <Label className="w-20 shrink-0 text-xs text-muted-foreground">{field.label}</Label>
                  <Input readOnly value={field.value} className="h-8 rounded-lg font-mono text-sm" />
                  <Button
                    variant={tools.dbCopied === field.key ? 'default' : 'secondary'}
                    size="xs"
                    onClick={() => tools.copyDbField(field.value, field.key)}
                  >
                    {tools.dbCopied === field.key ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              ))}
            </div>

            <DialogFooter className="sm:justify-start">
              <Button
                size="sm"
                onClick={() => {
                  const params = new URLSearchParams({
                    server: db.host,
                    username: db.user,
                    db: db.database,
                  });
                  window.open(`${db.adminerUrl}?${params.toString()}`, '_blank');
                }}
              >
                Open Adminer
              </Button>
              <Button variant="outline" size="sm" onClick={tools.closeDbModal}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
