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
}

/** Every label a site container carries: Traefik routing plus our bookkeeping. */
export function buildSiteLabels(input: SiteLabelInput): Record<string, string> {
  const r = `traefik.http.routers.${input.subdomain}`;
  return {
    'traefik.enable': 'true',
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
  };
}
