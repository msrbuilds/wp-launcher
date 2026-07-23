import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { statusDotClass } from '../types';

export default function SharedWithMe({ shares }: { shares: any[] }) {
  if (shares.length === 0) return null;

  return (
    <div className="mb-6">
      <h4 className="mb-3 text-sm font-semibold text-foreground">
        Shared with me ({shares.length})
      </h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
        {shares.map((share: any) => (
          <div
            key={share.id}
            className="flex flex-col gap-4 rounded-xl border border-border border-l-4 border-l-primary bg-card p-6 text-card-foreground"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', statusDotClass(share.site_status))} />
                <span className="text-xs capitalize text-muted-foreground">{share.site_status}</span>
              </span>
              <Badge variant={share.role === 'admin' ? 'default' : 'secondary'}>
                {share.role.toUpperCase()}
              </Badge>
            </div>

            <div>
              <h3 className="text-base font-semibold">
                <a href={share.site_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {share.subdomain}
                </a>
              </h3>
              <div className="mt-1 text-xs text-muted-foreground">{share.product_id}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href={share.site_url} target="_blank" rel="noopener noreferrer">Visit</a>
              </Button>
              {share.role === 'admin' && share.admin_url && (
                <Button asChild size="sm">
                  <a href={share.admin_url} target="_blank" rel="noopener noreferrer">Admin</a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
