import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  /** Rendered pixel size; the ring/text scale with it. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-20 w-20 text-xl',
};

// A small fixed palette keyed by a string hash. Values are literal HSL rather
// than theme tokens on purpose: the tint identifies a *person*, so it must stay
// stable and distinct across light and dark themes (a sanctioned exception to
// the tokens-only rule, like the editor brand colours).
const TINTS = [
  'hsl(210 90% 45%)', 'hsl(160 70% 38%)', 'hsl(280 65% 55%)', 'hsl(340 75% 52%)',
  'hsl(24 85% 50%)', 'hsl(190 80% 40%)', 'hsl(255 70% 58%)', 'hsl(130 55% 40%)',
];

function initials(name?: string | null, email?: string | null): string {
  const source = (name || '').trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  const handle = (email || '').trim();
  return handle ? handle.slice(0, 2).toUpperCase() : '?';
}

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export function Avatar({ name, email, src, size = 'md', className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  const seed = (email || name || '').toLowerCase();

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold text-white',
        SIZES[size],
        className,
      )}
      style={showImage ? undefined : { backgroundColor: tintFor(seed) }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name, email)
      )}
    </span>
  );
}
