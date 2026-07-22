import { describe, it, expect } from 'vitest';
import { readableForeground } from './color';

describe('readableForeground', () => {
  it('puts dark text on light accents', () => {
    expect(readableForeground('#fde047')).toBe('#0a0a0a');
    expect(readableForeground('#ffffff')).toBe('#0a0a0a');
  });

  it('puts light text on dark accents', () => {
    expect(readableForeground('#14213d')).toBe('#ffffff');
    expect(readableForeground('#000000')).toBe('#ffffff');
  });

  it('handles the default orange accent', () => {
    expect(readableForeground('#fb8500')).toBe('#0a0a0a');
  });

  it('accepts shorthand hex', () => {
    expect(readableForeground('#fff')).toBe('#0a0a0a');
    expect(readableForeground('#000')).toBe('#ffffff');
  });

  it('falls back to light text on an unparseable value', () => {
    expect(readableForeground('not-a-colour')).toBe('#ffffff');
  });
});
