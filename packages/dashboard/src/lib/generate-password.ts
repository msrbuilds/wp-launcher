// Random passwords for new sites' WordPress admin accounts.
//
// The symbol set is deliberately small: the password travels as a container env
// var into a shell-quoted wp-cli argument and gets pasted into terminals, so it
// avoids quotes, backslashes, `$`, backticks, spaces and URL-significant
// characters. 20 characters from this alphabet is ~120 bits.

const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '!@#%^*-_=+';

// Lookalikes (l, I, O, 0, 1) are dropped so a password read off the screen can
// be retyped.
export const PASSWORD_ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

const CLASSES = [LOWER, UPPER, DIGITS, SYMBOLS];

/** A uniform index in [0, n), by rejection so no character is favoured. */
function randomIndex(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

function pick(chars: string): string {
  return chars[randomIndex(chars.length)];
}

/**
 * A password with at least one lowercase letter, uppercase letter, digit and
 * symbol, so it satisfies any strength rule WordPress or a plugin applies.
 */
export function generatePassword(length = 20): string {
  if (length < CLASSES.length) {
    throw new Error(`Password length must be at least ${CLASSES.length}`);
  }
  const chars = CLASSES.map(pick);
  while (chars.length < length) chars.push(pick(PASSWORD_ALPHABET));

  // Shuffle so the guaranteed characters are not always the first four.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
