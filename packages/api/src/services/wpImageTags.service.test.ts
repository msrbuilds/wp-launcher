import { describe, it, expect } from 'vitest';
import { shapeMatrix, sortWpDesc, isBuildable, STATIC_WP_BY_PHP } from './wpImageTags.service';

describe('sortWpDesc', () => {
  it('orders newest first, treating minors numerically', () => {
    expect(sortWpDesc(['6.8', '7.0', '6.10', '6.9'])).toEqual(['7.0', '6.10', '6.9', '6.8']);
  });
});

describe('shapeMatrix', () => {
  it('falls back to the static baseline when nothing is fetched', () => {
    expect(shapeMatrix({})).toEqual(STATIC_WP_BY_PHP);
  });

  it('adds fetched versions on top of the baseline, newest first', () => {
    const out = shapeMatrix({ '8.3': new Set(['7.0', '6.9']) });
    expect(out['8.3'][0]).toBe('7.0');
    expect(out['8.3']).toContain('6.7'); // baseline preserved
  });

  it('ignores PHP versions we do not support', () => {
    const out = shapeMatrix({ '9.9': new Set(['7.0']) });
    expect(out['9.9']).toBeUndefined();
  });

  it('keeps PHP 7.4 legacy at WP 6.1', () => {
    expect(shapeMatrix({})['7.4']).toEqual(['6.1']);
  });
});

describe('isBuildable', () => {
  const matrix = { '8.3': ['7.0', '6.9'], '7.4': ['6.1'] };
  it('accepts an offered pair', () => { expect(isBuildable(matrix, '8.3', '7.0')).toBe(true); });
  it('rejects an unoffered pair', () => { expect(isBuildable(matrix, '7.4', '7.0')).toBe(false); });
  it('rejects an unknown php', () => { expect(isBuildable(matrix, '9.9', '7.0')).toBe(false); });
});
