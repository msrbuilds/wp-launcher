import { describe, it, expect } from 'vitest';
import { sanitizeImageTag, wpVersionForPhp, IMAGE_PREFIX, generateDockerfile } from './imageBuild.service';

describe('sanitizeImageTag', () => {
  it('builds a prefixed, slugged tag with a default :latest', () => {
    expect(sanitizeImageTag('My Shop!')).toBe('wp-launcher/my-shop:latest');
  });
  it('honours an explicit tag and slugs it', () => {
    expect(sanitizeImageTag('Shop', 'v2 RC')).toBe('wp-launcher/shop:v2-rc');
  });
  it('rejects an empty slug', () => {
    expect(() => sanitizeImageTag('!!!')).toThrow();
  });
  it('never allows path traversal', () => {
    expect(sanitizeImageTag('../evil')).toBe('wp-launcher/evil:latest');
  });
});

describe('wpVersionForPhp', () => {
  it('pairs 7.4 with WP 6.1', () => { expect(wpVersionForPhp('7.4')).toBe('6.1'); });
  it('pairs 8.x with the default WP', () => { expect(wpVersionForPhp('8.3')).toBe('6.9'); });
  it('rejects unknown php versions', () => { expect(() => wpVersionForPhp('9.9')).toThrow(); });
});

it('exposes the namespace prefix', () => { expect(IMAGE_PREFIX).toBe('wp-launcher/'); });

describe('generateDockerfile', () => {
  const base = { kind: 'custom' as const, name: 'shop', phpVersion: '8.3', plugins: [], themes: [] };

  it('starts FROM the correct base image', () => {
    expect(generateDockerfile(base)).toMatch(/^FROM wp-launcher\/wordpress:php8\.3\n/);
  });
  it('adds a wordpress.org plugin via curl', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'wordpress.org', slug: 'woocommerce' }] });
    expect(df).toContain('downloads.wordpress.org/plugin/woocommerce.latest-stable.zip');
    expect(df).toContain('/usr/src/wordpress/wp-content/plugins/');
  });
  it('copies a local plugin zip placed in the context', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'local', filename: 'my-plugin.zip' }] });
    expect(df).toContain('COPY my-plugin.zip /tmp/my-plugin.zip');
    expect(df).toContain('unzip /tmp/my-plugin.zip -d /usr/src/wordpress/wp-content/plugins/');
  });
  it('adds a theme URL install', () => {
    const df = generateDockerfile({ ...base, themes: [{ source: 'url', url: 'https://ex.com/t.zip' }] });
    expect(df).toContain('curl -L "https://ex.com/t.zip"');
    expect(df).toContain('/usr/src/wordpress/wp-content/themes/');
  });
  it('ignores sources with missing fields', () => {
    const df = generateDockerfile({ ...base, plugins: [{ source: 'wordpress.org' }] });
    expect(df.trim()).toBe('FROM wp-launcher/wordpress:php8.3');
  });
});
