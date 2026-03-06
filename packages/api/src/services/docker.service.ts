import Docker from 'dockerode';
import { config } from '../config';

export interface CreateContainerOptions {
  subdomain: string;
  image: string;
  expiresAt: string;
  siteUrl: string;
  adminUser: string;
  adminPassword: string;
  adminEmail: string;
  siteTitle: string;
  activatePlugins?: string;
  removePlugins?: string;
  activeTheme?: string;
  landingPage?: string;
}

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export async function createSiteContainer(opts: CreateContainerOptions): Promise<string> {
  const containerName = `wp-demo-${opts.subdomain}`;

  const env = [
    `WP_SITE_URL=${opts.siteUrl}`,
    `WP_SITE_TITLE=${opts.siteTitle}`,
    `WP_ADMIN_USER=${opts.adminUser}`,
    `WP_ADMIN_PASSWORD=${opts.adminPassword}`,
    `WP_ADMIN_EMAIL=${opts.adminEmail}`,
    `WP_DEMO_EXPIRES_AT=${opts.expiresAt}`,
  ];

  if (opts.activatePlugins) {
    env.push(`WP_ACTIVATE_PLUGINS=${opts.activatePlugins}`);
  }
  if (opts.removePlugins) {
    env.push(`WP_REMOVE_PLUGINS=${opts.removePlugins}`);
  }
  if (opts.activeTheme) {
    env.push(`WP_ACTIVE_THEME=${opts.activeTheme}`);
  }
  if (opts.landingPage) {
    env.push(`WP_DEMO_LANDING_PAGE=${opts.landingPage}`);
  }

  const container = await docker.createContainer({
    Image: opts.image,
    name: containerName,
    Env: env,
    Labels: {
      'traefik.enable': 'true',
      [`traefik.http.routers.${opts.subdomain}.rule`]: `Host(\`${opts.subdomain}.${config.baseDomain}\`)`,
      [`traefik.http.services.${opts.subdomain}.loadbalancer.server.port`]: '80',
      'wp-launcher.managed': 'true',
      'wp-launcher.site-id': opts.subdomain,
      'wp-launcher.expires-at': opts.expiresAt,
    },
    HostConfig: {
      NetworkMode: config.dockerNetwork,
      Memory: config.defaults.containerMemoryLimit,
      NanoCpus: config.defaults.containerCpuLimit * 1e9,
      RestartPolicy: { Name: 'unless-stopped' },
    },
  });

  await container.start();
  return container.id;
}

export async function removeSiteContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();

    if (info.State.Running) {
      await container.stop({ t: 5 });
    }

    await container.remove({ v: true });
  } catch (err: any) {
    if (err.statusCode === 404) {
      return; // Container already removed
    }
    throw err;
  }
}

export async function getContainerStatus(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Status;
  } catch (err: any) {
    if (err.statusCode === 404) {
      return 'removed';
    }
    throw err;
  }
}

export async function listManagedContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({
    all: true,
    filters: { label: ['wp-launcher.managed=true'] },
  });
}

export async function buildImage(
  contextPath: string,
  tag: string,
): Promise<void> {
  const stream = await docker.buildImage(
    { context: contextPath, src: ['.'] },
    { t: tag },
  );

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export { docker };
