export interface SiteLabelInput {
  subdomain: string;
  baseDomain: string;
  enableTls: boolean;
  /**
   * An ACME resolver name, or empty to mean "a wildcard certificate covering
   * this domain is already loaded in Traefik". Blank emits `tls=true` with no
   * resolver, so Traefik serves the existing certificate rather than requesting
   * one per site — which matters because Let's Encrypt allows only 50
   * certificates per registered domain per week.
   */
  certResolver: string;
  /**
   * The Docker network Traefik should reach this container on. Required when
   * Traefik's own configured network differs from the container's, as on
   * Dokploy. Empty omits the label, which is correct for the bundled Traefik.
   */
  traefikNetwork: string;
  expiresAt: string;
  dbContainerId?: string;
  /**
   * Which shared database engine this site uses, if any. Teardown reads this
   * to know it must drop a database rather than remove a sidecar container.
   */
  dbEngine?: string;
  /**
   * Whether to emit `traefik.enable=true`. Defaults to true, which is right
   * for the standalone install: its bundled Traefik runs with
   * `exposedByDefault: false` and needs the label to route the site at all.
   *
   * Set false where another Traefik shares the same Docker daemon, as on
   * Dokploy. Both proxies read every container's labels, so the label made
   * the platform's Traefik claim the site with a higher-priority per-host
   * router and then fail to reach it — it is not attached to the private
   * site network. Our own Traefik finds the container by constraint on
   * `wp-launcher.routable` instead, so it does not need this label.
   */
  emitEnableLabel?: boolean;
}

/** Every label a site container carries: Traefik routing plus our bookkeeping. */
export function buildSiteLabels(input: SiteLabelInput): Record<string, string> {
  const r = `traefik.http.routers.${input.subdomain}`;
  return {
    ...(input.emitEnableLabel === false ? {} : { 'traefik.enable': 'true' }),
    // How a constrained Traefik selects our containers without relying on
    // `traefik.enable`, which any co-resident proxy would also honour.
    'wp-launcher.routable': 'true',
    [`${r}.rule`]: `Host(\`${input.subdomain}.${input.baseDomain}\`)`,
    [`traefik.http.services.${input.subdomain}.loadbalancer.server.port`]: '80',
    ...(input.traefikNetwork ? { 'traefik.docker.network': input.traefikNetwork } : {}),
    ...(input.enableTls
      ? {
          [`${r}.entrypoints`]: 'websecure',
          [`${r}.tls`]: 'true',
          ...(input.certResolver ? { [`${r}.tls.certresolver`]: input.certResolver } : {}),
        }
      : {}),
    'wp-launcher.managed': 'true',
    'wp-launcher.site-id': input.subdomain,
    'wp-launcher.expires-at': input.expiresAt,
    ...(input.dbContainerId ? { 'wp-launcher.db-container': input.dbContainerId } : {}),
    ...(input.dbEngine ? { 'wp-launcher.db-engine': input.dbEngine } : {}),
  };
}
