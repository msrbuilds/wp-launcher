import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { TunnelController } from '../hooks/useTunnel';
import { TunnelMethod } from '../types';

const METHODS: { value: TunnelMethod; label: string; desc: string }[] = [
  {
    value: 'cloudflare', label: 'Cloudflare',
    desc: 'Free public URL via Cloudflare Quick Tunnel. No account needed.',
  },
  {
    value: 'lan', label: 'LAN',
    desc: 'Share on your local network. Other devices can access via IP address.',
  },
  {
    value: 'ngrok', label: 'ngrok',
    desc: 'Public URL via ngrok. Requires a free auth token from ngrok.com.',
  },
];

interface Props {
  siteId: string;
  tunnel: TunnelController;
}

export default function TunnelPanel({ siteId, tunnel }: Props) {
  const info = tunnel.status[siteId];

  if (info?.active) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge className="uppercase tracking-wide">{info.method}</Badge>
          {info.status === 'connecting' ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Establishing tunnel...
            </span>
          ) : (
            <span className="text-sm font-medium text-emerald-600">Connected</span>
          )}
        </div>

        {info.url && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={info.url}
              className="h-8 max-w-md rounded-lg font-mono text-sm"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <Button size="xs" onClick={() => tunnel.copyUrl(info.url || '')}>
              {tunnel.copied ? 'Copied!' : 'Copy'}
            </Button>
            <Button asChild variant="secondary" size="xs">
              <a href={info.url} target="_blank" rel="noopener noreferrer">Open</a>
            </Button>
          </div>
        )}

        <Button variant="destructive" size="xs" className="mt-3" onClick={() => tunnel.remove(siteId)}>
          Stop Sharing
        </Button>
      </div>
    );
  }

  const active = METHODS.find((m) => m.value === tunnel.method);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {METHODS.map((m) => (
          <Button
            key={m.value}
            size="sm"
            variant={tunnel.method === m.value ? 'default' : 'outline'}
            className={cn('rounded-lg uppercase', tunnel.method !== m.value && 'text-muted-foreground')}
            onClick={() => tunnel.setMethod(m.value)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{active?.desc}</p>

      {tunnel.method === 'ngrok' && (
        <Input
          className="mt-3 h-8 max-w-md rounded-lg text-sm"
          placeholder="Enter ngrok auth token"
          value={tunnel.ngrokToken}
          onChange={(e) => tunnel.setNgrokToken(e.target.value)}
        />
      )}

      <Button
        size="sm"
        className="mt-3"
        onClick={() => tunnel.create(siteId)}
        disabled={tunnel.creatingId === siteId || (tunnel.method === 'ngrok' && !tunnel.ngrokToken)}
      >
        {tunnel.creatingId === siteId
          ? <><Loader2 className="h-3 w-3 animate-spin" /> Starting...</>
          : 'Start Sharing'}
      </Button>
    </div>
  );
}
