import { describe, it, expect } from 'vitest';
import { isLocalHostname, buildPublicApiBaseUrl } from './deployment';

describe('isLocalHostname', () => {
  it('treats localhost and its subdomains as local', () => {
    expect(isLocalHostname('localhost')).toBe(true);
    expect(isLocalHostname('wp.localhost')).toBe(true);
    expect(isLocalHostname('LOCALHOST')).toBe(true);
  });

  it('treats loopback and IPv6 loopback as local', () => {
    expect(isLocalHostname('127.0.0.1')).toBe(true);
    expect(isLocalHostname('127.1.2.3')).toBe(true);
    expect(isLocalHostname('::1')).toBe(true);
    expect(isLocalHostname('[::1]')).toBe(true);
  });

  it('treats mDNS .local names as local', () => {
    expect(isLocalHostname('my-mac.local')).toBe(true);
  });

  it('treats RFC1918 private ranges as local', () => {
    expect(isLocalHostname('10.0.0.5')).toBe(true);
    expect(isLocalHostname('192.168.1.20')).toBe(true);
    expect(isLocalHostname('172.16.0.1')).toBe(true);
    expect(isLocalHostname('172.31.255.254')).toBe(true);
  });

  it('does not treat public hosts or near-miss ranges as local', () => {
    expect(isLocalHostname('demo.example.com')).toBe(false);
    expect(isLocalHostname('172.32.0.1')).toBe(false);
    expect(isLocalHostname('172.15.0.1')).toBe(false);
    expect(isLocalHostname('8.8.8.8')).toBe(false);
    expect(isLocalHostname('')).toBe(false);
  });
});

describe('buildPublicApiBaseUrl', () => {
  it('adds the API port for a local host, since the API is its own origin in dev', () => {
    expect(buildPublicApiBaseUrl('http://localhost', 'localhost')).toBe('http://localhost:3737');
  });

  it('leaves a fronted public domain on its own origin', () => {
    expect(buildPublicApiBaseUrl('https://demo.example.com', 'demo.example.com'))
      .toBe('https://demo.example.com');
  });

  it('respects an explicit port instead of forcing the API port', () => {
    expect(buildPublicApiBaseUrl('http://localhost:8080', 'localhost')).toBe('http://localhost:8080');
  });

  it('strips a trailing slash', () => {
    expect(buildPublicApiBaseUrl('https://demo.example.com/', 'demo.example.com'))
      .toBe('https://demo.example.com');
  });

  it('preserves a sub-path mount', () => {
    expect(buildPublicApiBaseUrl('https://example.com/panel', 'example.com'))
      .toBe('https://example.com/panel');
  });

  it('falls back to the base domain when PUBLIC_URL is unset', () => {
    expect(buildPublicApiBaseUrl('', 'demo.example.com')).toBe('http://demo.example.com');
    expect(buildPublicApiBaseUrl('', 'localhost')).toBe('http://localhost:3737');
  });

  it('assumes http when PUBLIC_URL omits a scheme', () => {
    expect(buildPublicApiBaseUrl('demo.example.com', 'demo.example.com'))
      .toBe('http://demo.example.com');
  });
});
