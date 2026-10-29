import { describe, it, expect } from 'vitest';
import { buildSiteLabels } from './site-labels';

const base = {
  subdomain: 'happy-fox-1234',
  baseDomain: 'demo.example.com',
  enableTls: false,
  certResolver: 'letsencrypt',
  traefikNetwork: '',
  expiresAt: '2026-12-31T00:00:00.000Z',
};

describe('buildSiteLabels', () => {
  it('always emits the router rule, service port and bookkeeping labels', () => {
    const l = buildSiteLabels(base);
    expect(l['traefik.enable']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.rule']).toBe('Host(`happy-fox-1234.demo.example.com`)');
    expect(l['traefik.http.services.happy-fox-1234.loadbalancer.server.port']).toBe('80');
    expect(l['wp-launcher.managed']).toBe('true');
    expect(l['wp-launcher.site-id']).toBe('happy-fox-1234');
    expect(l['wp-launcher.expires-at']).toBe('2026-12-31T00:00:00.000Z');
  });

  it('omits all TLS labels when TLS is off', () => {
    const l = buildSiteLabels(base);
    expect(l['traefik.http.routers.happy-fox-1234.entrypoints']).toBeUndefined();
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBeUndefined();
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBeUndefined();
  });

  it('requests a per-site certificate when a resolver is named', () => {
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: 'letsencrypt' });
    expect(l['traefik.http.routers.happy-fox-1234.entrypoints']).toBe('websecure');
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBe('letsencrypt');
  });

  it('leaves the certificate to a preloaded wildcard when the resolver is blank', () => {
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: '' });
    expect(l['traefik.http.routers.happy-fox-1234.tls']).toBe('true');
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBeUndefined();
  });

  it('asks for the shared wildcard certificate when told to', () => {
    // A router with its own `tls` block ignores the entrypoint's tls.domains, so
    // the wildcard must be named on the router or Traefik issues one
    // certificate per site against Let's Encrypt's 50-per-week limit.
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: 'wpl', wildcardCert: true });
    expect(l['traefik.http.routers.happy-fox-1234.tls.certresolver']).toBe('wpl');
    expect(l['traefik.http.routers.happy-fox-1234.tls.domains[0].main']).toBe('demo.example.com');
    expect(l['traefik.http.routers.happy-fox-1234.tls.domains[0].sans']).toBe('*.demo.example.com');
  });

  it('names no domains when the wildcard is off, so the Host rule decides', () => {
    const l = buildSiteLabels({ ...base, enableTls: true, certResolver: 'wpl' });
    expect(l['traefik.http.routers.happy-fox-1234.tls.domains[0].main']).toBeUndefined();
    expect(l['traefik.http.routers.happy-fox-1234.tls.domains[0].sans']).toBeUndefined();
  });

  it('names no wildcard without a resolver or without TLS', () => {
    // Blank resolver means a preloaded certificate; asking for domains would
    // make Traefik look for a resolver that is not there.
    const blank = buildSiteLabels({ ...base, enableTls: true, certResolver: '', wildcardCert: true });
    expect(blank['traefik.http.routers.happy-fox-1234.tls.domains[0].main']).toBeUndefined();
    const plain = buildSiteLabels({ ...base, enableTls: false, wildcardCert: true });
    expect(plain['traefik.http.routers.happy-fox-1234.tls.domains[0].main']).toBeUndefined();
  });

  it('pins the Traefik network only when one is configured', () => {
    expect(buildSiteLabels(base)['traefik.docker.network']).toBeUndefined();
    expect(buildSiteLabels({ ...base, traefikNetwork: 'dokploy-network' })['traefik.docker.network'])
      .toBe('dokploy-network');
  });

  it('marks the container routable so a constrained Traefik can find it', () => {
    expect(buildSiteLabels(base)['wp-launcher.routable']).toBe('true');
    expect(buildSiteLabels({ ...base, emitEnableLabel: false })['wp-launcher.routable']).toBe('true');
  });

  it('omits traefik.enable when told to hide from label-scanning proxies', () => {
    // On Dokploy two Traefiks share one Docker daemon. traefik.enable=true made
    // the platform's Traefik claim the container with a higher-priority router
    // and then fail to reach it, since it is not on the private site network.
    expect(buildSiteLabels(base)['traefik.enable']).toBe('true');
    expect(buildSiteLabels({ ...base, emitEnableLabel: false })['traefik.enable']).toBeUndefined();
  });

  it('records the database sidecar only when there is one', () => {
    expect(buildSiteLabels(base)['wp-launcher.db-container']).toBeUndefined();
    expect(buildSiteLabels({ ...base, dbContainerId: 'abc123' })['wp-launcher.db-container']).toBe('abc123');
  });

  it('records which shared engine the site uses, so teardown can find it', () => {
    expect(buildSiteLabels(base)['wp-launcher.db-engine']).toBeUndefined();
    expect(buildSiteLabels({ ...base, dbEngine: 'mariadb' })['wp-launcher.db-engine']).toBe('mariadb');
  });
});
