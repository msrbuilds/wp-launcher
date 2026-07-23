import {
  createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'destructive';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastOptions {
  description?: string;
  /** Auto-dismiss after this many ms (default 4500). */
  duration?: number;
}

interface ToastApi {
  show: (title: string, options?: ToastOptions & { variant?: ToastVariant }) => void;
  success: (title: string, options?: ToastOptions) => void;
  error: (title: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Branded, themed replacement for window.alert() — a transient corner toast.
 *   const toast = useToast();
 *   toast.error('Failed to delete');
 *   toast.success('Saved');
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const ICON: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  destructive: AlertCircle,
};

const ACCENT: Record<ToastVariant, string> = {
  default: 'text-muted-foreground',
  success: 'text-success',
  destructive: 'text-destructive',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((title: string, variant: ToastVariant, options?: ToastOptions) => {
    const id = (idRef.current += 1);
    setToasts((ts) => [...ts, { id, title, description: options?.description, variant }]);
    const duration = options?.duration ?? 4500;
    if (duration > 0) setTimeout(() => remove(id), duration);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show: (title, options) => push(title, options?.variant ?? 'default', options),
    success: (title, options) => push(title, 'success', options),
    error: (title, options) => push(title, 'destructive', options),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-end gap-2 p-4 sm:max-w-sm sm:left-auto">
        {toasts.map((t) => {
          const Icon = ICON[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-bottom-2"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ACCENT[t.variant])} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{t.title}</div>
                {t.description && <div className="mt-0.5 text-sm text-muted-foreground">{t.description}</div>}
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                aria-label="Dismiss"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
