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
    <div className="pagination">
      <span className="pagination-info">
        {start}–{end} of {total}
      </span>
      <div className="pagination-controls">
        <button disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          ‹
        </button>
        {buttons.map((b, i) =>
          b === '...' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', color: '#94a3b8' }}>…</span>
          ) : (
            <button
              key={b}
              className={b === page ? 'active' : ''}
              onClick={() => onPageChange(b)}
            >
              {b + 1}
            </button>
          ),
        )}
        <button disabled={page >= totalPages - 1} onClick={() => onPageChange(page + 1)}>
          ›
        </button>
      </div>
    </div>
  );
}
