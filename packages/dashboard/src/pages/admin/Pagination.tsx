import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  const buttons: (number | '...')[] = [];
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || Math.abs(i - page) <= 1) {
      buttons.push(i);
    } else if (buttons[buttons.length - 1] !== '...') {
      buttons.push('...');
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <span className="text-xs text-muted-foreground">
        {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {buttons.map((b, i) =>
          b === '...' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-sm text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={b}
              variant={b === page ? 'default' : 'outline'}
              size="icon"
              onClick={() => onPageChange(b)}
              aria-current={b === page ? 'page' : undefined}
            >
              {b + 1}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
