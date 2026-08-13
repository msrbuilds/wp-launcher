import { cn } from '@/lib/utils';
import { evaluatePassword, type StrengthScore } from '@/lib/password-strength';

// Colour tier by score: weak → destructive, fair/good → accent, strong → success.
// These map to semantic tokens, so they follow the light/dark theme.
const TIER: Record<Exclude<StrengthScore, 0>, { bar: string; text: string }> = {
  1: { bar: 'bg-destructive', text: 'text-destructive' },
  2: { bar: 'bg-primary', text: 'text-primary' },
  3: { bar: 'bg-primary', text: 'text-primary' },
  4: { bar: 'bg-success', text: 'text-success' },
};

/**
 * `minLength` must match whatever the surrounding form gates submission on,
 * otherwise the meter can read "Strong" while the submit button stays disabled.
 */
export function PasswordStrengthMeter({
  password,
  className,
  minLength,
}: {
  password: string;
  className?: string;
  minLength?: number;
}) {
  if (!password) return null;

  const { score, label, suggestions } = evaluatePassword(password, minLength);
  const tier = score === 0 ? null : TIER[score];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <div
            key={seg}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              score >= seg && tier ? tier.bar : 'bg-muted',
            )}
          />
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={cn('font-medium', tier ? tier.text : 'text-muted-foreground')}>
          {label}
        </span>
        {suggestions.length > 0 && (
          <span className="truncate text-muted-foreground">{suggestions.join(' · ')}</span>
        )}
      </div>
    </div>
  );
}
