const DARK_TEXT = '#0a0a0a';
const LIGHT_TEXT = '#ffffff';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, '');
  const full = value.length === 3
    ? value.split('').map((c) => c + c).join('')
    : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Pick readable text for an admin-chosen accent, using WCAG relative luminance.
 * The accent is arbitrary, so the paired foreground has to be derived rather
 * than fixed, or dark text lands on a dark button.
 */
export function readableForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return LIGHT_TEXT;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const luminance = 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  // 0.179 is the crossover where black and white give equal WCAG contrast
  // against the background. Above it black wins, below it white does. A naive
  // "is it bright?" threshold picks white on mid-tones like #fb8500, where
  // black is more than three times more readable (8.6:1 against 2.4:1).
  return luminance > 0.179 ? DARK_TEXT : LIGHT_TEXT;
}
