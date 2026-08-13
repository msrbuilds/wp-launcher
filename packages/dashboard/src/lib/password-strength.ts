/**
 * A small, dependency-free password strength estimator. It scores on length and
 * character-class variety, then caps the score for passwords that are common,
 * all one character, or a simple run (which otherwise look "varied enough").
 *
 * Not a substitute for server-side length enforcement — it drives UI feedback
 * and blocks obviously weak choices before submit.
 */

export type StrengthScore = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  /** 0 = empty, 1 = weak, 2 = fair, 3 = good, 4 = strong. */
  score: StrengthScore;
  label: string;
  suggestions: string[];
  /** Meets the minimum policy to allow submission (length ≥ 8 and not weak). */
  ok: boolean;
}

const MIN_LENGTH = 8;

// A short list of the most-abused passwords. Kept small on purpose — the real
// job of stopping determined attackers is rate limiting and hashing, not this.
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty', 'qwerty123', 'letmein', 'welcome', 'admin', 'admin123', 'iloveyou',
  'abc12345', 'monkey', 'dragon', 'football', 'baseball', 'sunshine', 'princess',
  'changeme', 'passw0rd', 'trustno1', 'whatever', 'starwars',
]);

const LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

function isSequential(pw: string): boolean {
  if (pw.length < 4) return false;
  let ascending = true;
  let sameRun = true;
  for (let i = 1; i < pw.length; i++) {
    const diff = pw.charCodeAt(i) - pw.charCodeAt(i - 1);
    if (diff !== 1) ascending = false;
    if (diff !== 0) sameRun = false;
  }
  return ascending || sameRun;
}

/**
 * `minLength` lets a caller raise the bar above the default. It must, because
 * the meter and the submit gate have to agree: the setup page requires 12, and
 * when this function assumed 8 an 11-character password rendered a green
 * "Strong" while the button stayed disabled with nothing explaining why.
 */
export function evaluatePassword(pw: string, minLength: number = MIN_LENGTH): PasswordStrength {
  if (!pw) {
    return { score: 0, label: '', suggestions: [], ok: false };
  }

  const len = pw.length;
  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSymbol = /[^A-Za-z0-9]/.test(pw);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  let raw = 0;
  if (len >= minLength) raw++;
  if (len >= 12) raw++;
  if (classes >= 2) raw++;
  if (classes >= 3) raw++;
  if (classes >= 4 || len >= 16) raw++;

  // Cap trivially guessable passwords no matter their surface variety.
  const lower = pw.toLowerCase();
  if (COMMON.has(lower) || isSequential(pw)) raw = 1;

  const suggestions: string[] = [];
  if (len < minLength) {
    const short = minLength - len;
    suggestions.push(`${short} more character${short === 1 ? '' : 's'} (minimum ${minLength})`);
  } else if (len < 12) {
    suggestions.push('Longer passwords are stronger (12+)');
  }
  if (!hasUpper || !hasLower) suggestions.push('Mix upper and lower case');
  if (!hasDigit) suggestions.push('Add a number');
  if (!hasSymbol) suggestions.push('Add a symbol');
  if (COMMON.has(lower)) suggestions.push('Avoid common passwords');
  else if (isSequential(pw)) suggestions.push('Avoid simple sequences and repeats');

  let score: StrengthScore;
  if (len < minLength) score = 0;
  else score = Math.max(1, Math.min(4, raw)) as StrengthScore;

  const ok = len >= minLength && score >= 2;
  const label = LABELS[score];

  return { score, label, suggestions: suggestions.slice(0, 2), ok };
}
