import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActivityEntry, activityDotClass } from '../types';

interface Props {
  entries: ActivityEntry[];
  expanded: boolean;
  onToggle: () => void;
}

export default function ActivityTimeline({ entries, expanded, onToggle }: Props) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className={cn('flex items-center justify-between gap-3', expanded && 'mb-4')}>
        <h3 className="text-base font-semibold">Recent Activity</h3>
        <Button variant="outline" size="xs" onClick={onToggle}>
          {expanded ? 'Hide' : 'Show'}
        </Button>
      </div>

      {expanded && (
        entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {entries.map((log, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-start gap-3 py-2',
                  i < entries.length - 1 && 'border-b border-border',
                )}
              >
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', activityDotClass(log.action))} />
                <div className="min-w-0">
                  <div className="text-sm">
                    <strong className="font-semibold capitalize">{log.action}</strong>{' '}
                    <span className="text-foreground">{log.subdomain}</span>
                    {log.product_id && (
                      <span className="text-muted-foreground"> ({log.product_id})</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
