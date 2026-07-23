import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Consistent surface for the inline panels shown under a site row or card. */
export default function PanelShell({ title, subtitle, actions, children, className }: Props) {
  return (
    <div className={cn('rounded-xl border border-border bg-muted p-4 text-foreground', className)}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">{title}</span>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
