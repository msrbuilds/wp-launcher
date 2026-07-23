import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

function countdown(scheduledAt: string): string {
  const ms = new Date(scheduledAt).getTime() - Date.now();
  if (ms <= 0) return 'any moment now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  launches: any[];
  onCancel: (id: string) => void;
}

export default function ScheduledLaunches({ launches, onCancel }: Props) {
  if (launches.length === 0) return null;

  return (
    <div className="mb-6">
      <h4 className="mb-3 text-sm font-semibold text-foreground">
        Scheduled ({launches.length})
      </h4>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
        {launches.map((launch) => (
          <div
            key={launch.id}
            className="flex flex-col gap-4 rounded-xl border border-dashed border-border bg-card p-6 text-card-foreground"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Clock className="h-3.5 w-3.5" /> Scheduled
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(launch.scheduled_at).toLocaleDateString()}{' '}
                {new Date(launch.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            <div>
              <h3 className="text-base font-semibold">{launch.product_id}</h3>
              <div className="mt-1 text-xs text-muted-foreground">
                Launches in {countdown(launch.scheduled_at)}
              </div>
            </div>

            <div>
              <Button variant="destructive" size="sm" onClick={() => onCancel(launch.id)}>
                Cancel
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
