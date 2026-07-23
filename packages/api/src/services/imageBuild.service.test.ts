import { describe, it, expect } from 'vitest';
import { baseImageTag, wpVersionForPhp, IMAGE_PREFIX } from './imageBuild.service';

describe('wpVersionForPhp', () => {
  it('pairs 7.4 with WP 6.1', () => { expect(wpVersionForPhp('7.4')).toBe('6.1'); });
  it('pairs 8.x with the default WP', () => { expect(wpVersionForPhp('8.5')).toBe('6.9'); });
  it('rejects unknown php versions', () => { expect(() => wpVersionForPhp('9.9')).toThrow(); });
});

describe('baseImageTag', () => {
  it('uses the legacy php-only tag for the default WP pairing', () => {
    expect(baseImageTag('8.3')).toBe('wp-launcher/wordpress:php8.3');
    expect(baseImageTag('8.3', '6.9')).toBe('wp-launcher/wordpress:php8.3');
    expect(baseImageTag('7.4', '6.1')).toBe('wp-launcher/wordpress:php7.4');
  });
  it('suffixes the WP version for non-default pairings', () => {
    expect(baseImageTag('8.3', '6.8')).toBe('wp-launcher/wordpress:php8.3-wp6.8');
    expect(baseImageTag('8.5', '6.7')).toBe('wp-launcher/wordpress:php8.5-wp6.7');
  });
});

it('exposes the namespace prefix', () => { expect(IMAGE_PREFIX).toBe('wp-launcher/'); });
