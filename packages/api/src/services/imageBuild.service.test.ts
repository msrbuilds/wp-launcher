import { describe, it, expect } from 'vitest';
import {
  baseImageTag, wpVersionForPhp, IMAGE_PREFIX, parseBaseImageTag, LATEST_TAG,
  isDefaultBaseTag,
} from './imageBuild.service';

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

describe('parseBaseImageTag', () => {
  it('reads php and WP back out of a php-only tag', () => {
    expect(parseBaseImageTag('wp-launcher/wordpress:php8.3')).toEqual({ phpVersion: '8.3', wpVersion: '6.9' });
    expect(parseBaseImageTag('wp-launcher/wordpress:php7.4')).toEqual({ phpVersion: '7.4', wpVersion: '6.1' });
  });

  it('reads both versions out of a suffixed tag', () => {
    expect(parseBaseImageTag('wp-launcher/wordpress:php8.5-wp6.7')).toEqual({ phpVersion: '8.5', wpVersion: '6.7' });
  });

  it('round-trips every tag baseImageTag can produce', () => {
    for (const php of ['8.5', '8.4', '8.3', '8.2', '8.1']) {
      for (const wp of ['6.9', '6.8', '6.7']) {
        const parsed = parseBaseImageTag(baseImageTag(php, wp));
        expect(parsed, `${php}/${wp}`).toEqual({ phpVersion: php, wpVersion: wp });
      }
    }
  });

  it('resolves :latest to the default pair', () => {
    // :latest is the default WP_IMAGE for every install, but baseImageTag can
    // never emit it — so rebuilding it means building the default pair, whose
    // tag isDefaultBaseTag then re-aliases.
    expect(parseBaseImageTag(LATEST_TAG)).toEqual({ phpVersion: '8.3', wpVersion: '6.9' });
    const spec = parseBaseImageTag(LATEST_TAG)!;
    expect(isDefaultBaseTag(baseImageTag(spec.phpVersion, spec.wpVersion))).toBe(true);
  });

  it('returns null for images it cannot rebuild', () => {
    // Custom product images are built by scripts/create-product.sh with baked-in
    // plugins and themes. Offering a one-click rebuild would produce a base
    // image under their name and silently strip their contents.
    expect(parseBaseImageTag('wp-launcher/my-product:latest')).toBeNull();
    expect(parseBaseImageTag('wordpress:6.9')).toBeNull();
    expect(parseBaseImageTag('wp-launcher/wordpress:php9.9')).toBeNull();
    expect(parseBaseImageTag('wp-launcher/wordpress:nonsense')).toBeNull();
  });
});

describe('isDefaultBaseTag', () => {
  it('is true only for the pair that :latest aliases', () => {
    // The rule that keeps panel builds and build-wp-image.sh in step: without
    // it, a rebuild from the panel leaves :latest dangling and every launch
    // keeps failing on the image the operator just rebuilt.
    expect(isDefaultBaseTag('wp-launcher/wordpress:php8.3')).toBe(true);
    expect(isDefaultBaseTag('wp-launcher/wordpress:php8.4')).toBe(false);
    expect(isDefaultBaseTag('wp-launcher/wordpress:php8.3-wp6.7')).toBe(false);
    expect(isDefaultBaseTag(LATEST_TAG)).toBe(false);
  });
});
