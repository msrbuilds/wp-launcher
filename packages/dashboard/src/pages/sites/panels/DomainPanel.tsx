import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DomainsController } from '../hooks/useDomains';
import { Site } from '../types';

interface Props {
  site: Site;
  domains: DomainsController;
  variant?: 'full' | 'compact';
}

export default function DomainPanel({ site, domains, variant = 'full' }: Props) {
  const info = domains.status[site.id];
  const error = domains.errors[site.id];
  const verified = info?.status === 'verified';

  if (info?.domain) {
    return (
      <div className="text-sm text-foreground">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">{info.domain}</span>
          <Badge variant={verified ? 'secondary' : 'outline'}>
            {variant === 'full'
              ? (verified ? 'DNS Verified' : 'DNS Pending')
              : (verified ? 'Verified' : 'Pending DNS')}
          </Badge>
          <Button
            variant="secondary"
            size="xs"
            className="ml-auto"
            onClick={() => domains.load(site.id, true)}
            disabled={domains.recheckingId === site.id}
          >
            {domains.recheckingId === site.id
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Checking...</>
              : 'Recheck'}
          </Button>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => domains.remove(site.id)}
            disabled={domains.savingId === site.id}
          >
            Remove
          </Button>
        </div>

        {variant === 'full' ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Point a CNAME record for <strong>{info.domain}</strong> to{' '}
            <strong>{site.subdomain}.{window.location.hostname}</strong>
          </p>
        ) : !verified && (
          <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Configure your DNS (choose one):</p>
            <p>
              <strong className="text-foreground">CNAME</strong> (for subdomains like demo.client.com):<br />
              <code className="mt-1 inline-block rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
                {info.domain} → CNAME → {info.dns?.baseDomain || window.location.hostname}
              </code>
            </p>
            <p>
              <strong className="text-foreground">A Record</strong> (for root domains like client.com):<br />
              <code className="mt-1 inline-block rounded bg-background px-1.5 py-0.5 font-mono text-foreground">
                {info.domain} → A → {info.dns?.serverIp || 'your server IP'}
              </code>
            </p>
            <p>DNS changes may take up to 24-48 hours to propagate.</p>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs rounded-lg text-sm"
          placeholder={variant === 'full' ? 'demo.yourdomain.com' : 'demo.example.com or example.com'}
          value={domains.input[site.id] || ''}
          onChange={(e) => domains.setInput(site.id, e.target.value)}
          disabled={domains.savingId === site.id}
        />
        <Button
          size="xs"
          onClick={() => domains.save(site.id)}
          disabled={domains.savingId === site.id || !(domains.input[site.id] || '').trim()}
        >
          {domains.savingId === site.id
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>
            : 'Set Domain'}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        {variant === 'full' ? (
          <>After setting, create a CNAME DNS record pointing to{' '}
            <strong>{site.subdomain}.{window.location.hostname}</strong></>
        ) : (
          <>After setting, you'll need to add a CNAME or A record in your DNS provider pointing to
            this server. WordPress URLs will be automatically updated.</>
        )}
      </p>
    </div>
  );
}
