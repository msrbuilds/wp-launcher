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

describe('isPrivateIp: special-purpose ranges', () => {
  it.each([
    '::', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::127.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', '2001:0:4136:e378::1',
    '2001:db8::1', 'fec0::1', 'ff02::1', '100::1',
    '224.0.0.1', '239.255.255.250', '240.0.0.1', '255.255.255.255', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1',
  ])('blocks %s', (ip) => { expect(isPrivateIp(ip)).toBe(true); });

  it('blocks any IPv6 outside global unicast (2000::/3)', () => {
    expect(isPrivateIp('3fff:ffff::1')).toBe(false);
    expect(isPrivateIp('4000::1')).toBe(true);
  });

  it('blocks anything that is not an IP at all (fail closed)', () => {
    expect(isPrivateIp('not-an-ip')).toBe(true);
  });
});
