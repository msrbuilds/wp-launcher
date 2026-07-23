import { describe, it, expect } from 'vitest';
import {
  baseImageTag, wpVersionForPhp, allowedWpVersions, validatePhpWp, IMAGE_PREFIX,
} from './imageBuild.service';

describe('wpVersionForPhp', () => {
  it('pairs 7.4 with WP 6.1', () => { expect(wpVersionForPhp('7.4')).toBe('6.1'); });
  it('pairs 8.x with the default WP', () => { expect(wpVersionForPhp('8.5')).toBe('6.9'); });
  it('rejects unknown php versions', () => { expect(() => wpVersionForPhp('9.9')).toThrow(); });
});

describe('allowedWpVersions', () => {
  it('offers the modern WP list for PHP 8.x', () => {
    expect(allowedWpVersions('8.3')).toEqual(['6.9', '6.8', '6.7']);
  });
  it('offers only WP 6.1 for PHP 7.4', () => {
    expect(allowedWpVersions('7.4')).toEqual(['6.1']);
  });
});

describe('validatePhpWp', () => {
  it('accepts a supported combination', () => {
    expect(() => validatePhpWp('8.5', '6.9')).not.toThrow();
  });
  it('rejects an unsupported PHP', () => {
    expect(() => validatePhpWp('9.9', '6.9')).toThrow();
  });
  it('rejects an unsupported WP for the PHP', () => {
    expect(() => validatePhpWp('7.4', '6.9')).toThrow();
  });
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
