import { describe, expect, it } from 'vitest';
import { isPrivateIp } from './ssrf';

describe('isPrivateIp', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1'])(
    'blocks %s', (ip) => { expect(isPrivateIp(ip)).toBe(true); },
  );

  it('blocks carrier-grade NAT space (100.64.0.0/10)', () => {
    expect(isPrivateIp('100.64.0.1')).toBe(true);
    expect(isPrivateIp('100.127.255.254')).toBe(true);
    expect(isPrivateIp('100.128.0.1')).toBe(false);
  });

  it('allows public addresses', () => {
    expect(isPrivateIp('93.184.216.34')).toBe(false);
    expect(isPrivateIp('2606:4700::1111')).toBe(false);
  });
});
