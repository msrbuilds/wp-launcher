import express, { Request, Response, NextFunction } from 'express';
import Docker from 'dockerode';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '4000', 10);
const INTERNAL_KEY = process.env.INTERNAL_KEY;
if (!INTERNAL_KEY) {
  console.error('[FATAL] INTERNAL_KEY is required. Set it before starting the provisioner.');
  process.exit(1);
}
const BASE_DOMAIN = process.env.BASE_DOMAIN || 'localhost';
const DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'wp-launcher-network';
const ENABLE_TLS = process.env.ENABLE_TLS === 'true';
const CERT_RESOLVER = process.env.CERT_RESOLVER || 'letsencrypt';
const CONTAINER_MEMORY = parseInt(process.env.CONTAINER_MEMORY || String(256 * 1024 * 1024), 10);
const CONTAINER_CPU = parseFloat(process.env.CONTAINER_CPU || '0.5');
const WP_UPLOAD_LIMIT = process.env.WP_UPLOAD_LIMIT || String(2 * 1024 * 1024); // 2MB per file
const WP_DISK_QUOTA = process.env.WP_DISK_QUOTA || String(100 * 1024 * 1024); // 100MB total uploads
const PRODUCT_ASSETS_PATH = process.env.PRODUCT_ASSETS_PATH || ''; // Host path to product-assets for bind-mounting

// Connect to Docker — via DOCKER_HOST (socket proxy) or local socket
const docker = process.env.DOCKER_HOST
  ? new Docker({
      host: new URL(process.env.DOCKER_HOST).hostname,
      port: Number(new URL(process.env.DOCKER_HOST).port) || 2375,
    })
  : new Docker({ socketPath: '/var/run/docker.sock' });

// Internal auth — only the API service should be able to call us
function internalAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key'];
  if (key !== INTERNAL_KEY) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

app.use(express.json({ limit: '64kb' }));
app.use(internalAuth);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// --- Input validation ---

const ALLOWED_IMAGE_PREFIX = process.env.ALLOWED_IMAGE_PREFIX || 'wp-launcher/';
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTAINER_ID_RE = /^[a-f0-9]{12,64}$/;
const MAX_CONCURRENT_CONTAINERS = parseInt(process.env.MAX_CONTAINERS || '100', 10);

function validateSubdomain(s: string): boolean {
  return typeof s === 'string' && s.length <= 63 && SUBDOMAIN_RE.test(s);
}

function validateImage(img: string): boolean {
  return typeof img === 'string' && img.startsWith(ALLOWED_IMAGE_PREFIX) && !img.includes('..');
}

function validateContainerId(id: string): boolean {
  return typeof id === 'string' && CONTAINER_ID_RE.test(id);
}

// --- Container lifecycle ---

interface CreateBody {
  subdomain: string;
  image: string;
  expiresAt: string;
  siteUrl: string;
  adminUser: string;
  adminPassword: string;
  adminEmail: string;
  siteTitle: string;
  installActivatePlugins?: string;
  installPlugins?: string;
  activatePlugins?: string;
  removePlugins?: string;
  installThemes?: string;
  activeTheme?: string;
  landingPage?: string;
  dbEngine?: 'sqlite' | 'mysql' | 'mariadb';
  autoLoginToken?: string;
  localMode?: boolean;
  phpConfig?: {
    memoryLimit?: string;
    uploadMaxFilesize?: string;
    postMaxSize?: string;
    maxExecutionTime?: string;
    maxInputVars?: string;
    displayErrors?: string;
    extensions?: string;  // comma-separated: "redis,xdebug,sockets"
  };
}

app.post('/containers', async (req: Request, res: Response) => {
  try {
    const opts: CreateBody = req.body;

    // Validate inputs to limit blast radius from a compromised API
    if (!validateSubdomain(opts.subdomain)) {
      res.status(400).json({ error: 'Invalid subdomain format' });
      return;
    }
    if (!validateImage(opts.image)) {
      res.status(400).json({ error: `Image must start with "${ALLOWED_IMAGE_PREFIX}"` });
      return;
    }

    // Enforce container cap
    const existing = await docker.listContainers({
      all: true,
      filters: { label: ['wp-launcher.managed=true'] },
    });
    if (existing.length >= MAX_CONCURRENT_CONTAINERS) {
      res.status(429).json({ error: 'Maximum container limit reached' });
      return;
    }

    const containerName = `wp-demo-${opts.subdomain}`;
    const useExternalDb = opts.dbEngine === 'mysql' || opts.dbEngine === 'mariadb';
    let dbContainerId: string | undefined;
    const dbContainerName = `wp-db-${opts.subdomain}`;
    const dbPassword = `wp_${opts.subdomain}_${Date.now().toString(36)}`;

    // If MySQL or MariaDB mode, create a database sidecar container first
    if (useExternalDb) {
      const DB_IMAGE = opts.dbEngine === 'mysql' ? 'mysql:8.4' : 'mariadb:11';
      try {
        await docker.getImage(DB_IMAGE).inspect();
      } catch {
        console.log(`[provisioner] Pulling ${DB_IMAGE}...`);
        const stream = await docker.pull(DB_IMAGE);
        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream, (err: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
        console.log(`[provisioner] ${DB_IMAGE} pulled.`);
      }

      const dbSidecar = await docker.createContainer({
        Image: DB_IMAGE,
        name: dbContainerName,
        Env: [
          'MYSQL_DATABASE=wordpress',
          'MYSQL_USER=wordpress',
          `MYSQL_PASSWORD=${dbPassword}`,
          'MYSQL_RANDOM_ROOT_PASSWORD=yes',
        ],
        Labels: {
          'wp-launcher.managed': 'true',
          'wp-launcher.site-id': opts.subdomain,
          'wp-launcher.role': opts.dbEngine || 'mariadb',
          'wp-launcher.expires-at': opts.expiresAt,
        },
        HostConfig: {
          NetworkMode: DOCKER_NETWORK,
          Memory: CONTAINER_MEMORY,
          NanoCpus: CONTAINER_CPU * 1e9,
          RestartPolicy: { Name: 'unless-stopped' },
        },
      });
      await dbSidecar.start();
      dbContainerId = dbSidecar.id;
    }

    const env = [
      `WP_SITE_URL=${opts.siteUrl}`,
      `WP_SITE_TITLE=${opts.siteTitle}`,
      `WP_ADMIN_USER=${opts.adminUser}`,
      `WP_ADMIN_PASSWORD=${opts.adminPassword}`,
      `WP_ADMIN_EMAIL=${opts.adminEmail}`,
      `WP_DEMO_EXPIRES_AT=${opts.expiresAt}`,
    ];

    if (useExternalDb) {
      env.push(
        `DB_ENGINE=${opts.dbEngine}`,
        `WORDPRESS_DB_HOST=${dbContainerName}`,
        'WORDPRESS_DB_USER=wordpress',
        `WORDPRESS_DB_PASSWORD=${dbPassword}`,
        'WORDPRESS_DB_NAME=wordpress',
      );
    } else {
      env.push('DB_ENGINE=sqlite');
    }

    if (!opts.localMode) {
      env.push(`WP_UPLOAD_LIMIT=${WP_UPLOAD_LIMIT}`);
      env.push(`WP_DISK_QUOTA=${WP_DISK_QUOTA}`);
    }

    if (opts.installActivatePlugins) env.push(`WP_INSTALL_PLUGINS_ACTIVATE=${opts.installActivatePlugins}`);
    if (opts.installPlugins) env.push(`WP_INSTALL_PLUGINS=${opts.installPlugins}`);
    if (opts.activatePlugins) env.push(`WP_ACTIVATE_PLUGINS=${opts.activatePlugins}`);
    if (opts.removePlugins) env.push(`WP_REMOVE_PLUGINS=${opts.removePlugins}`);
    if (opts.installThemes) env.push(`WP_INSTALL_THEMES=${opts.installThemes}`);
    if (opts.activeTheme) env.push(`WP_ACTIVE_THEME=${opts.activeTheme}`);
    if (opts.landingPage) env.push(`WP_DEMO_LANDING_PAGE=${opts.landingPage}`);
    if (opts.autoLoginToken) env.push(`WP_AUTO_LOGIN_TOKEN=${opts.autoLoginToken}`);
    if (opts.localMode) env.push('WP_LOCAL_MODE=true');

    // PHP configuration overrides
    if (opts.phpConfig) {
      const pc = opts.phpConfig;
      if (pc.memoryLimit) env.push(`PHP_MEMORY_LIMIT=${pc.memoryLimit}`);
      if (pc.uploadMaxFilesize) env.push(`PHP_UPLOAD_MAX_FILESIZE=${pc.uploadMaxFilesize}`);
      if (pc.postMaxSize) env.push(`PHP_POST_MAX_SIZE=${pc.postMaxSize}`);
      if (pc.maxExecutionTime) env.push(`PHP_MAX_EXECUTION_TIME=${pc.maxExecutionTime}`);
      if (pc.maxInputVars) env.push(`PHP_MAX_INPUT_VARS=${pc.maxInputVars}`);
      if (pc.displayErrors) env.push(`PHP_DISPLAY_ERRORS=${pc.displayErrors}`);
      if (pc.extensions) env.push(`PHP_EXTENSIONS=${pc.extensions}`);
    }

    // In local mode: no resource limits, mount persistent volume
    const useLocalMode = opts.localMode === true;
    const hostConfig: any = {
      NetworkMode: DOCKER_NETWORK,
      RestartPolicy: { Name: 'unless-stopped' },
    };

    // Mount product-assets if local plugins/themes need to be installed
    const allRefs = [opts.installActivatePlugins, opts.installPlugins, opts.installThemes].filter(Boolean).join(',');
    const needsAssets = allRefs.includes('/product-assets/');
    const assetBinds: string[] = [];
    if (needsAssets && PRODUCT_ASSETS_PATH) {
      assetBinds.push(`${PRODUCT_ASSETS_PATH}:/product-assets:ro`);
    }

    if (useLocalMode) {
      // Named volume for wp-content persistence
      hostConfig.Binds = [`wp-site-${opts.subdomain}:/var/www/html/wp-content`, ...assetBinds];
    } else {
      // Agency mode: enforce resource limits
      hostConfig.Memory = CONTAINER_MEMORY;
      hostConfig.NanoCpus = CONTAINER_CPU * 1e9;
      if (assetBinds.length) {
        hostConfig.Binds = [...(hostConfig.Binds || []), ...assetBinds];
      }
    }

    const container = await docker.createContainer({
      Image: opts.image,
      name: containerName,
      Env: env,
      Labels: {
        'traefik.enable': 'true',
        [`traefik.http.routers.${opts.subdomain}.rule`]: `Host(\`${opts.subdomain}.${BASE_DOMAIN}\`)`,
        [`traefik.http.services.${opts.subdomain}.loadbalancer.server.port`]: '80',
        ...(ENABLE_TLS ? {
          [`traefik.http.routers.${opts.subdomain}.entrypoints`]: 'websecure',
          [`traefik.http.routers.${opts.subdomain}.tls`]: 'true',
          [`traefik.http.routers.${opts.subdomain}.tls.certresolver`]: CERT_RESOLVER,
        } : {}),
        'wp-launcher.managed': 'true',
        'wp-launcher.site-id': opts.subdomain,
        'wp-launcher.expires-at': opts.expiresAt,
        ...(dbContainerId ? { 'wp-launcher.db-container': dbContainerId } : {}),
      },
      HostConfig: hostConfig,
    });

    await container.start();
    res.json({ containerId: container.id });
  } catch (err: any) {
    console.error('[provisioner] create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/containers/:id', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }
    const container = docker.getContainer(req.params.id);
    try {
      const info = await container.inspect();

      // If this WP container has a linked DB sidecar, remove it too
      const dbId = info.Config?.Labels?.['wp-launcher.db-container']
        || info.Config?.Labels?.['wp-launcher.mysql-container']; // backwards compat
      if (dbId) {
        try {
          const dbContainer = docker.getContainer(dbId);
          const dbInfo = await dbContainer.inspect();
          if (dbInfo.State.Running) {
            await dbContainer.stop({ t: 5 });
          }
          await dbContainer.remove({ v: true });
          console.log(`[provisioner] Removed DB sidecar: ${dbId.slice(0, 12)}`);
        } catch (dbErr: any) {
          if (dbErr.statusCode !== 404) {
            console.error('[provisioner] DB sidecar cleanup error:', dbErr.message);
          }
        }
      }

      // Get subdomain from labels for volume cleanup
      const siteId = info.Config?.Labels?.['wp-launcher.site-id'];

      if (info.State.Running) {
        await container.stop({ t: 5 });
      }
      await container.remove({ v: true });

      // Clean up named volume (wp-site-{subdomain}) if it exists
      if (siteId) {
        const volumeName = `wp-site-${siteId}`;
        try {
          const volume = docker.getVolume(volumeName);
          await volume.remove();
          console.log(`[provisioner] Removed volume: ${volumeName}`);
        } catch (volErr: any) {
          if (volErr.statusCode !== 404) {
            console.error(`[provisioner] Volume cleanup error (${volumeName}):`, volErr.message);
          }
        }
      }
    } catch (err: any) {
      if (err.statusCode === 404) {
        res.json({ status: 'already_removed' });
        return;
      }
      throw err;
    }
    res.json({ status: 'removed' });
  } catch (err: any) {
    console.error('[provisioner] remove error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/containers/:id/status', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    res.json({ status: info.State.Status });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.json({ status: 'removed' });
      return;
    }
    console.error('[provisioner] status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Live-update PHP configuration on a running container (no rebuild needed)
app.patch('/containers/:id/php-config', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { memoryLimit, uploadMaxFilesize, postMaxSize, maxExecutionTime, maxInputVars, displayErrors, extensions } = req.body;

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    // Build the ini content
    const iniLines = ['; WP Launcher runtime PHP overrides (live update)'];
    if (memoryLimit) iniLines.push(`memory_limit = ${memoryLimit}`);
    if (uploadMaxFilesize) iniLines.push(`upload_max_filesize = ${uploadMaxFilesize}`);
    if (postMaxSize) iniLines.push(`post_max_size = ${postMaxSize}`);
    if (maxExecutionTime) iniLines.push(`max_execution_time = ${maxExecutionTime}`);
    if (maxInputVars) iniLines.push(`max_input_vars = ${maxInputVars}`);
    if (displayErrors) iniLines.push(`display_errors = ${displayErrors}`);

    // Enable extensions
    if (extensions) {
      const exts = extensions.split(',').map((e: string) => e.trim()).filter(Boolean);
      for (const ext of exts) {
        if (ext === 'xdebug') {
          iniLines.push('zend_extension=xdebug.so');
          iniLines.push('[xdebug]');
          iniLines.push(`xdebug.mode = ${req.body.xdebugMode || 'debug'}`);
          iniLines.push('xdebug.start_with_request = yes');
          iniLines.push('xdebug.client_host = host.docker.internal');
          iniLines.push('xdebug.client_port = 9003');
        } else {
          iniLines.push(`extension=${ext}.so`);
        }
      }
    }

    const iniContent = iniLines.join('\n');
    const iniPath = '/usr/local/etc/php/conf.d/99-wp-launcher.ini';

    // Write ini file and gracefully reload Apache
    // Use heredoc via bash -c to avoid quoting issues
    const script = `cat > ${iniPath} << 'PHPINI'\n${iniContent}\nPHPINI\napachectl graceful`;
    const exec = await container.exec({
      Cmd: ['bash', '-c', script],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      stream.on('end', resolve);
      stream.on('error', resolve);
      // Timeout after 10s
      setTimeout(resolve, 10000);
    });

    console.log(`[provisioner] PHP config updated for container ${req.params.id.slice(0, 12)}`);
    res.json({ status: 'updated' });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] php-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/containers', async (_req: Request, res: Response) => {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ['wp-launcher.managed=true'] },
    });
    res.json(containers);
  } catch (err: any) {
    console.error('[provisioner] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/images/build', async (req: Request, res: Response) => {
  try {
    const { contextPath, tag } = req.body;
    if (!validateImage(tag)) {
      res.status(400).json({ error: `Image tag must start with "${ALLOWED_IMAGE_PREFIX}"` });
      return;
    }
    if (typeof contextPath !== 'string' || contextPath.includes('..')) {
      res.status(400).json({ error: 'Invalid context path' });
      return;
    }
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

    res.json({ status: 'built', tag });
  } catch (err: any) {
    console.error('[provisioner] build error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[provisioner] Running on port ${PORT}`);
});
