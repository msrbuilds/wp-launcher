import express, { Request, Response, NextFunction } from 'express';
import Docker from 'dockerode';
import crypto from 'crypto';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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
// PRODUCT_ASSETS_PATH is passed through env for reference but the provisioner
// reads from its own /product-assets mount (set in docker-compose.yml)

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

// Create a minimal tar archive buffer containing a single file (for putArchive)
function createTarBuffer(filename: string, content: string): Buffer {
  const data = Buffer.from(content, 'utf-8');
  const nameBytes = Buffer.from(filename, 'utf-8');

  // TAR header is 512 bytes
  const header = Buffer.alloc(512, 0);
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

  // File mode: 0644
  Buffer.from('0000644\0', 'ascii').copy(header, 100);
  // Owner/group ID: 0
  Buffer.from('0000000\0', 'ascii').copy(header, 108);
  Buffer.from('0000000\0', 'ascii').copy(header, 116);
  // File size in octal
  Buffer.from(data.length.toString(8).padStart(11, '0') + '\0', 'ascii').copy(header, 124);
  // Modification time
  Buffer.from(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 'ascii').copy(header, 136);
  // Type flag: '0' = regular file
  header[156] = 0x30;
  // Checksum placeholder (spaces)
  Buffer.from('        ', 'ascii').copy(header, 148);

  // Calculate checksum
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  Buffer.from(checksum.toString(8).padStart(6, '0') + '\0 ', 'ascii').copy(header, 148);

  // Pad data to 512-byte boundary
  const padding = 512 - (data.length % 512 || 512);
  const endBlock = Buffer.alloc(1024, 0); // Two zero blocks = end of archive

  return Buffer.concat([header, data, Buffer.alloc(padding === 512 ? 0 : padding, 0), endBlock]);
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

      // DB sidecars need more memory than WP containers — MySQL 8.4 requires ~512MB minimum.
      // Apply a separate, higher limit (2x the WP container limit, minimum 512MB).
      const DB_MIN_MEMORY = 512 * 1024 * 1024; // 512MB
      const dbMemory = CONTAINER_MEMORY > 0 ? Math.max(CONTAINER_MEMORY * 2, DB_MIN_MEMORY) : 0;

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
          ...(dbMemory > 0 ? { Memory: dbMemory } : {}),
          ...(CONTAINER_CPU > 0 ? { NanoCpus: CONTAINER_CPU * 1e9 } : {}),
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
    // autoLoginToken is no longer injected as env var — tokens are written on-demand via putArchive
    if (opts.localMode) env.push('WP_LOCAL_MODE=true');

    // Generate unique WordPress salts per container
    const wpSaltKeys = [
      'WORDPRESS_AUTH_KEY', 'WORDPRESS_SECURE_AUTH_KEY',
      'WORDPRESS_LOGGED_IN_KEY', 'WORDPRESS_NONCE_KEY',
      'WORDPRESS_AUTH_SALT', 'WORDPRESS_SECURE_AUTH_SALT',
      'WORDPRESS_LOGGED_IN_SALT', 'WORDPRESS_NONCE_SALT',
    ];
    for (const key of wpSaltKeys) {
      env.push(`${key}=${crypto.randomBytes(32).toString('base64url')}`);
    }

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

    // Check if local plugins/themes need product-assets
    const allRefs = [opts.installActivatePlugins, opts.installPlugins, opts.installThemes].filter(Boolean).join(',');
    const needsAssets = allRefs.includes('/product-assets/');

    if (useLocalMode) {
      // Named volume for wp-content persistence
      hostConfig.Binds = [`wp-site-${opts.subdomain}:/var/www/html/wp-content`];
    } else {
      // Agency mode: enforce resource limits
      hostConfig.Memory = CONTAINER_MEMORY;
      hostConfig.NanoCpus = CONTAINER_CPU * 1e9;
    }

    let container;
    try {
      container = await docker.createContainer({
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
    } catch (wpErr: any) {
      // Rollback: clean up DB sidecar if it was created
      if (dbContainerId) {
        try {
          const dbSidecar = docker.getContainer(dbContainerId);
          const dbInfo = await dbSidecar.inspect();
          if (dbInfo.State.Running) {
            await dbSidecar.stop({ t: 5 });
          }
          await dbSidecar.remove({ v: true });
          console.log(`[provisioner] Rolled back DB sidecar ${dbContainerId.slice(0, 12)} after WP container failure`);
        } catch (cleanupErr: any) {
          console.error('[provisioner] Failed to clean up DB sidecar during rollback:', cleanupErr.message);
        }
      }
      throw wpErr;
    }

    // Copy local plugin/theme assets into the container (avoids bind mount path issues on Windows)
    // The provisioner has /product-assets mounted via docker-compose.yml
    if (needsAssets) {
      try {
        const tarBuffer = execSync('tar cf - -C / product-assets', { maxBuffer: 200 * 1024 * 1024 });
        await container.putArchive(tarBuffer, { path: '/' });
        console.log(`[provisioner] Copied product-assets into ${containerName}`);
      } catch (copyErr: any) {
        console.error(`[provisioner] Warning: failed to copy product-assets into ${containerName}:`, copyErr.message);
      }
    }

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

// Get DB credentials from a running container's environment
app.get('/containers/:id/db-credentials', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    const env = info.Config.Env || [];
    const getEnv = (key: string) => env.find((e: string) => e.startsWith(`${key}=`))?.split('=').slice(1).join('=') || '';

    const dbEngine = getEnv('DB_ENGINE') || 'sqlite';
    if (dbEngine === 'sqlite') {
      res.json({ dbEngine: 'sqlite', host: '', user: '', password: '', database: '' });
      return;
    }

    res.json({
      dbEngine,
      host: getEnv('WORDPRESS_DB_HOST'),
      user: getEnv('WORDPRESS_DB_USER') || 'wordpress',
      password: getEnv('WORDPRESS_DB_PASSWORD'),
      database: getEnv('WORDPRESS_DB_NAME') || 'wordpress',
    });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] db-credentials error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Container resource stats (CPU, memory)
app.get('/containers/:id/stats', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    // Get one-shot stats (stream: false)
    const stats = await container.stats({ stream: false }) as any;

    // Calculate CPU percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - (stats.precpu_stats?.cpu_usage?.total_usage || 0);
    const systemDelta = stats.cpu_stats.system_cpu_usage - (stats.precpu_stats?.system_cpu_usage || 0);
    const numCpus = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage?.percpu_usage?.length || 1;
    const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

    // Memory
    const memUsage = stats.memory_stats?.usage || 0;
    const memLimit = stats.memory_stats?.limit || 0;
    const memCache = stats.memory_stats?.stats?.cache || 0;
    const memActual = memUsage - memCache;
    const memPercent = memLimit > 0 ? (memActual / memLimit) * 100 : 0;

    // Network I/O
    let netRx = 0, netTx = 0;
    if (stats.networks) {
      for (const iface of Object.values(stats.networks) as any[]) {
        netRx += iface.rx_bytes || 0;
        netTx += iface.tx_bytes || 0;
      }
    }

    res.json({
      cpu: { percent: Math.round(cpuPercent * 100) / 100, cores: numCpus },
      memory: {
        used: memActual,
        limit: memLimit,
        percent: Math.round(memPercent * 100) / 100,
        usedMB: Math.round(memActual / 1024 / 1024),
        limitMB: Math.round(memLimit / 1024 / 1024),
      },
      network: { rxBytes: netRx, txBytes: netTx },
      uptime: info.State.StartedAt,
      pid: info.State.Pid,
    });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] stats error:', err.message);
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

    // Defense-in-depth: validate all PHP config values with strict allowlists
    const MEMORY_RE = /^\d+[MmGgKk]$/;
    const NUMERIC_RE = /^\d+$/;
    const DISPLAY_ERRORS_RE = /^(On|Off|0|1)$/i;
    const ALLOWED_EXTS = new Set(['redis', 'xdebug', 'sockets', 'calendar', 'pcntl', 'ldap', 'gettext']);

    if (memoryLimit && !MEMORY_RE.test(memoryLimit)) { res.status(400).json({ error: 'Invalid memoryLimit' }); return; }
    if (uploadMaxFilesize && !MEMORY_RE.test(uploadMaxFilesize)) { res.status(400).json({ error: 'Invalid uploadMaxFilesize' }); return; }
    if (postMaxSize && !MEMORY_RE.test(postMaxSize)) { res.status(400).json({ error: 'Invalid postMaxSize' }); return; }
    if (maxExecutionTime && !NUMERIC_RE.test(maxExecutionTime)) { res.status(400).json({ error: 'Invalid maxExecutionTime' }); return; }
    if (maxInputVars && !NUMERIC_RE.test(maxInputVars)) { res.status(400).json({ error: 'Invalid maxInputVars' }); return; }
    if (displayErrors && !DISPLAY_ERRORS_RE.test(displayErrors)) { res.status(400).json({ error: 'Invalid displayErrors' }); return; }
    if (extensions) {
      const extList = extensions.split(',').map((e: string) => e.trim()).filter(Boolean);
      for (const ext of extList) {
        if (!ALLOWED_EXTS.has(ext.toLowerCase())) { res.status(400).json({ error: `Invalid extension: ${ext}` }); return; }
      }
    }

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

    const iniContent = iniLines.join('\n') + '\n';
    const iniPath = '/usr/local/etc/php/conf.d/';
    const iniFilename = '99-wp-launcher.ini';

    // Write ini file safely using putArchive (no shell interpolation)
    const tarHeader = createTarBuffer(iniFilename, iniContent);
    await container.putArchive(tarHeader, { path: iniPath });

    // Gracefully reload Apache in a separate exec with no user input
    const exec = await container.exec({
      Cmd: ['apachectl', 'graceful'],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      stream.on('end', resolve);
      stream.on('error', resolve);
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

// Read current PHP config from a running container
app.get('/containers/:id/php-config', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const iniPath = '/usr/local/etc/php/conf.d/99-wp-launcher.ini';
    const exec = await container.exec({
      Cmd: ['cat', iniPath],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', resolve);
      setTimeout(resolve, 5000);
    });

    const raw = Buffer.concat(chunks).toString('utf-8');
    // Parse ini content into structured config
    const config: Record<string, string> = {};
    const extensions: string[] = [];

    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;

      // Extension lines
      if (trimmed.startsWith('zend_extension=') || trimmed.startsWith('extension=')) {
        const ext = trimmed.replace(/^(zend_)?extension=/, '').replace(/\.so$/, '');
        if (ext && !extensions.includes(ext)) extensions.push(ext);
        continue;
      }

      // Xdebug sub-settings (skip, we just track the extension)
      if (trimmed.startsWith('xdebug.')) continue;

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        config[key] = val;
      }
    }

    res.json({
      memoryLimit: config['memory_limit'] || '',
      uploadMaxFilesize: config['upload_max_filesize'] || '',
      postMaxSize: config['post_max_size'] || '',
      maxExecutionTime: config['max_execution_time'] || '',
      maxInputVars: config['max_input_vars'] || '',
      displayErrors: config['display_errors'] || '',
      extensions,
    });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] get php-config error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Write a new autologin token to a running container (for single-use token rotation)
app.patch('/containers/:id/autologin-token', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { token } = req.body;
    if (!token || typeof token !== 'string' || token.length < 16) {
      res.status(400).json({ error: 'Invalid token' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    // Write token to file inside container using putArchive (no shell interpolation)
    const tarBuffer = createTarBuffer('wp-autologin-token', token);
    await container.putArchive(tarBuffer, { path: '/tmp/' });

    console.log(`[provisioner] Autologin token updated for container ${req.params.id.slice(0, 12)}`);
    res.json({ status: 'updated' });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] autologin-token error:', err.message);
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

// --- Snapshot & Restore ---

const SNAPSHOTS_DIR = process.env.SNAPSHOTS_DIR || '/app/data/snapshots';

// Create a snapshot of a running container's wp-content
app.post('/containers/:id/snapshot', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { snapshotId } = req.body;
    if (!snapshotId) {
      res.status(400).json({ error: 'snapshotId is required' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const snapshotDir = path.join(SNAPSHOTS_DIR, snapshotId);
    fs.mkdirSync(snapshotDir, { recursive: true });

    const dbEngine = info.Config.Env?.find((e: string) => e.startsWith('DB_ENGINE='))?.split('=')[1] || 'sqlite';

    // For MySQL/MariaDB: dump DB first into the container, then archive everything
    if (dbEngine === 'mysql' || dbEngine === 'mariadb') {
      const dbHost = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_HOST='))?.split('=')[1];
      const dbUser = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_USER='))?.split('=')[1] || 'wordpress';
      const dbPass = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_PASSWORD='))?.split('=')[1] || '';
      const dbName = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_NAME='))?.split('=')[1] || 'wordpress';

      // Run mysqldump inside the container
      const dumpExec = await container.exec({
        Cmd: ['bash', '-c', `mysqldump --skip-ssl --no-tablespaces -h "${dbHost}" -u "${dbUser}" -p"${dbPass}" "${dbName}" > /var/www/html/wp-content/db-snapshot.sql 2>/dev/null`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const dumpStream = await dumpExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => {
        dumpStream.on('end', resolve);
        dumpStream.on('error', resolve);
        setTimeout(resolve, 30000);
      });
    }

    // Get wp-content as tar archive
    const archiveStream = await container.getArchive({ path: '/var/www/html/wp-content' });
    const tarPath = path.join(snapshotDir, 'wp-content.tar');
    const writeStream = fs.createWriteStream(tarPath);

    await new Promise<void>((resolve, reject) => {
      archiveStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Clean up the dump file from container (MySQL/MariaDB)
    if (dbEngine === 'mysql' || dbEngine === 'mariadb') {
      try {
        const cleanExec = await container.exec({
          Cmd: ['rm', '-f', '/var/www/html/wp-content/db-snapshot.sql'],
          AttachStdout: true,
          AttachStderr: true,
        });
        const cleanStream = await cleanExec.start({ hijack: true, stdin: false });
        await new Promise<void>((resolve) => {
          cleanStream.on('end', resolve);
          setTimeout(resolve, 5000);
        });
      } catch { /* ignore cleanup errors */ }
    }

    const stats = fs.statSync(tarPath);
    console.log(`[provisioner] Snapshot ${snapshotId} created (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    res.json({ snapshotId, sizeBytes: stats.size, dbEngine });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] snapshot error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Restore a snapshot into a running container
app.post('/containers/:id/restore', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { snapshotId, newSiteUrl } = req.body;
    if (!snapshotId) {
      res.status(400).json({ error: 'snapshotId is required' });
      return;
    }

    const tarPath = path.join(SNAPSHOTS_DIR, snapshotId, 'wp-content.tar');
    if (!fs.existsSync(tarPath)) {
      res.status(404).json({ error: 'Snapshot archive not found' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    // Stop Apache gracefully before restore
    try {
      const stopExec = await container.exec({
        Cmd: ['bash', '-c', 'apachectl graceful-stop || true'],
        AttachStdout: true,
        AttachStderr: true,
      });
      const stopStream = await stopExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => {
        stopStream.on('end', resolve);
        setTimeout(resolve, 5000);
      });
    } catch { /* continue even if graceful stop fails */ }

    // Clear existing wp-content and restore from snapshot
    const clearExec = await container.exec({
      Cmd: ['bash', '-c', 'rm -rf /var/www/html/wp-content/*'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const clearStream = await clearExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      clearStream.on('end', resolve);
      setTimeout(resolve, 10000);
    });

    // Put the snapshot archive back
    const tarBuffer = fs.readFileSync(tarPath);
    await container.putArchive(tarBuffer, { path: '/var/www/html' });

    // For MySQL/MariaDB: restore the DB dump
    const dbEngine = info.Config.Env?.find((e: string) => e.startsWith('DB_ENGINE='))?.split('=')[1] || 'sqlite';
    if (dbEngine === 'mysql' || dbEngine === 'mariadb') {
      const dbHost = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_HOST='))?.split('=')[1];
      const dbUser = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_USER='))?.split('=')[1] || 'wordpress';
      const dbPass = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_PASSWORD='))?.split('=')[1] || '';
      const dbName = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_NAME='))?.split('=')[1] || 'wordpress';

      const importExec = await container.exec({
        Cmd: ['bash', '-c', `mysql --skip-ssl -h "${dbHost}" -u "${dbUser}" -p"${dbPass}" "${dbName}" < /var/www/html/wp-content/db-snapshot.sql 2>/dev/null && rm -f /var/www/html/wp-content/db-snapshot.sql`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const importStream = await importExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => {
        importStream.on('end', resolve);
        setTimeout(resolve, 30000);
      });

      // Update siteurl/home if restoring into a different site (clone)
      if (newSiteUrl) {
        const replaceExec = await container.exec({
          Cmd: ['bash', '-c', `wp search-replace --all-tables --allow-root --path=/var/www/html $(wp option get siteurl --allow-root --path=/var/www/html 2>/dev/null) "${newSiteUrl}" 2>/dev/null || true`],
          AttachStdout: true,
          AttachStderr: true,
        });
        const replaceStream = await replaceExec.start({ hijack: true, stdin: false });
        await new Promise<void>((resolve) => {
          replaceStream.on('end', resolve);
          setTimeout(resolve, 15000);
        });
        console.log(`[provisioner] URL replaced to ${newSiteUrl}`);
      }
    }

    // For SQLite: also update URLs if restoring into a different site (clone)
    if (newSiteUrl && dbEngine !== 'mysql' && dbEngine !== 'mariadb') {
      const replaceExec = await container.exec({
        Cmd: ['bash', '-c', `wp search-replace --all-tables --allow-root --path=/var/www/html $(wp option get siteurl --allow-root --path=/var/www/html 2>/dev/null) "${newSiteUrl}" 2>/dev/null || true`],
        AttachStdout: true,
        AttachStderr: true,
      });
      const replaceStream = await replaceExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => {
        replaceStream.on('end', resolve);
        setTimeout(resolve, 15000);
      });
      console.log(`[provisioner] URL replaced to ${newSiteUrl} (SQLite)`);
    }

    // Restart Apache
    const restartExec = await container.exec({
      Cmd: ['bash', '-c', 'apachectl graceful || apache2ctl graceful || true'],
      AttachStdout: true,
      AttachStderr: true,
    });
    const restartStream = await restartExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => {
      restartStream.on('end', resolve);
      setTimeout(resolve, 5000);
    });

    console.log(`[provisioner] Restored snapshot ${snapshotId} into container ${req.params.id.slice(0, 12)}`);
    res.json({ status: 'restored' });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] restore error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Execute WP-CLI commands in a container (for template export)
app.post('/containers/:id/exec-wp', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { commands } = req.body as { commands: string[] };
    if (!Array.isArray(commands) || commands.length === 0) {
      res.status(400).json({ error: 'commands array is required' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const results: { command: string; output: string; exitCode: number }[] = [];

    for (const cmd of commands) {
      // Whitelist: only allow wp-cli commands
      if (!cmd.startsWith('wp ')) {
        results.push({ command: cmd, output: 'Only wp-cli commands are allowed', exitCode: 1 });
        continue;
      }

      const exec = await container.exec({
        Cmd: ['bash', '-c', `${cmd} --allow-root 2>&1`],
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', resolve);
        setTimeout(resolve, 15000);
      });

      const execInfo = await exec.inspect();
      results.push({
        command: cmd,
        output: Buffer.concat(chunks).toString('utf-8').replace(/[\x00-\x08]/g, ''),
        exitCode: execInfo.ExitCode ?? 1,
      });
    }

    res.json({ results });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] exec-wp error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Export plugin/theme assets from a container
app.post('/containers/:id/export-assets', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { plugins, themes, targetDir } = req.body as { plugins?: string[]; themes?: string[]; targetDir: string };
    if (!targetDir) {
      res.status(400).json({ error: 'targetDir is required' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const exported: { type: string; slug: string; path: string }[] = [];
    const assetsBase = `/product-assets`;
    const destBase = path.join(assetsBase, targetDir);

    // Zip and copy plugins
    if (plugins && plugins.length > 0) {
      const pluginsDir = path.join(destBase, 'plugins');
      fs.mkdirSync(pluginsDir, { recursive: true });

      for (const slug of plugins) {
        try {
          // Zip the plugin inside the container
          const zipExec = await container.exec({
            Cmd: ['bash', '-c', `cd /var/www/html/wp-content/plugins && zip -r /tmp/${slug}.zip ${slug}/ 2>/dev/null`],
            AttachStdout: true,
            AttachStderr: true,
          });
          const zipStream = await zipExec.start({ hijack: true, stdin: false });
          await new Promise<void>((resolve) => {
            zipStream.on('end', resolve);
            setTimeout(resolve, 30000);
          });

          // Extract the zip from container
          const archiveStream = await container.getArchive({ path: `/tmp/${slug}.zip` });
          const zipPath = path.join(pluginsDir, `${slug}.zip`);

          // getArchive returns a tar stream, need to extract the zip from it
          const tarChunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            archiveStream.on('data', (chunk: Buffer) => tarChunks.push(chunk));
            archiveStream.on('end', resolve);
            archiveStream.on('error', reject);
          });

          // The tar contains a single file; extract it (skip 512-byte header)
          const tarBuffer = Buffer.concat(tarChunks);
          // Find the actual file data after the tar header
          const headerEnd = 512;
          // Read file size from header bytes 124-135 (octal)
          const sizeStr = tarBuffer.slice(124, 135).toString().trim();
          const fileSize = parseInt(sizeStr, 8) || 0;
          if (fileSize > 0) {
            const fileData = tarBuffer.slice(headerEnd, headerEnd + fileSize);
            fs.writeFileSync(zipPath, fileData);
            exported.push({ type: 'plugin', slug, path: `${targetDir}/plugins/${slug}.zip` });
          }
        } catch (plugErr: any) {
          console.error(`[provisioner] Failed to export plugin ${slug}:`, plugErr.message);
        }
      }
    }

    // Zip and copy themes
    if (themes && themes.length > 0) {
      const themesDir = path.join(destBase, 'themes');
      fs.mkdirSync(themesDir, { recursive: true });

      for (const slug of themes) {
        try {
          const zipExec = await container.exec({
            Cmd: ['bash', '-c', `cd /var/www/html/wp-content/themes && zip -r /tmp/${slug}.zip ${slug}/ 2>/dev/null`],
            AttachStdout: true,
            AttachStderr: true,
          });
          const zipStream = await zipExec.start({ hijack: true, stdin: false });
          await new Promise<void>((resolve) => {
            zipStream.on('end', resolve);
            setTimeout(resolve, 30000);
          });

          const archiveStream = await container.getArchive({ path: `/tmp/${slug}.zip` });
          const zipPath = path.join(themesDir, `${slug}.zip`);

          const tarChunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            archiveStream.on('data', (chunk: Buffer) => tarChunks.push(chunk));
            archiveStream.on('end', resolve);
            archiveStream.on('error', reject);
          });

          const tarBuffer = Buffer.concat(tarChunks);
          const headerEnd = 512;
          const sizeStr = tarBuffer.slice(124, 135).toString().trim();
          const fileSize = parseInt(sizeStr, 8) || 0;
          if (fileSize > 0) {
            const fileData = tarBuffer.slice(headerEnd, headerEnd + fileSize);
            fs.writeFileSync(zipPath, fileData);
            exported.push({ type: 'theme', slug, path: `${targetDir}/themes/${slug}.zip` });
          }
        } catch (themeErr: any) {
          console.error(`[provisioner] Failed to export theme ${slug}:`, themeErr.message);
        }
      }
    }

    res.json({ exported });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] export-assets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Custom Domain (Traefik dynamic config) ---

const CUSTOM_DOMAINS_DIR = process.env.CUSTOM_DOMAINS_DIR || '/etc/traefik/dynamic/custom-domains';
// When empty, Traefik serves TLS without requesting a cert (works with Cloudflare proxy + SSL mode "Full")
// Set to "httpchallenge" or "letsencrypt" only if the custom domain bypasses Cloudflare proxy
const CUSTOM_DOMAIN_CERT_RESOLVER = process.env.CUSTOM_DOMAIN_CERT_RESOLVER || '';

// Write Traefik dynamic config for a custom domain
app.put('/custom-domains/:subdomain', (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const { domain } = req.body;

    if (!subdomain || !domain) {
      res.status(400).json({ error: 'subdomain and domain are required' });
      return;
    }

    fs.mkdirSync(CUSTOM_DOMAINS_DIR, { recursive: true });

    const tlsConfig = CUSTOM_DOMAIN_CERT_RESOLVER
      ? `      tls:\n        certResolver: ${CUSTOM_DOMAIN_CERT_RESOLVER}`
      : `      tls: {}`;

    const yamlContent = `http:
  routers:
    custom-${subdomain}:
      rule: "Host(\`${domain}\`)"
      service: "${subdomain}"
      entryPoints:
        - websecure
${tlsConfig}
    custom-${subdomain}-http:
      rule: "Host(\`${domain}\`)"
      service: "${subdomain}"
      entryPoints:
        - web
  services:
    ${subdomain}:
      loadBalancer:
        servers:
          - url: "http://wp-demo-${subdomain}:80"
`;

    const filePath = path.join(CUSTOM_DOMAINS_DIR, `${subdomain}.yml`);
    fs.writeFileSync(filePath, yamlContent);

    console.log(`[provisioner] Custom domain config written: ${domain} -> ${subdomain}`);
    res.json({ status: 'configured', domain, subdomain });
  } catch (err: any) {
    console.error('[provisioner] custom-domain write error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove Traefik dynamic config for a custom domain
app.delete('/custom-domains/:subdomain', (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const filePath = path.join(CUSTOM_DOMAINS_DIR, `${subdomain}.yml`);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[provisioner] Custom domain config removed for ${subdomain}`);
    }

    res.json({ status: 'removed', subdomain });
  } catch (err: any) {
    console.error('[provisioner] custom-domain delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Site Password Protection ---
// Write an .htpasswd file + .htaccess rewrite to password-protect the frontend

app.patch('/containers/:id/site-password', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const { password, scope } = req.body; // scope: 'frontend' | 'admin' | 'all'
    const protectScope = scope || 'frontend';
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    if (!password) {
      // Remove password protection — clean up all related files and restore .htaccess
      const exec = await container.exec({
        Cmd: ['bash', '-c', 'rm -f /var/www/html/.htpasswd /var/www/html/.wpl-password-protect /var/www/html/.wpl-htaccess-auth && sed -i "/# WP Launcher Password Protection/,/# END WP Launcher Password Protection/d" /var/www/html/.htaccess 2>/dev/null; true'],
        AttachStdout: true, AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => { stream.on('end', resolve); setTimeout(resolve, 5000); });

      console.log(`[provisioner] Password protection removed for ${req.params.id.slice(0, 12)}`);
      res.json({ status: 'removed' });
      return;
    }

    // Generate bcrypt hash using htpasswd (available in Apache image)
    const exec = await container.exec({
      Cmd: ['htpasswd', '-nbB', 'demo', password],
      AttachStdout: true, AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const stdoutChunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      // Docker multiplexed stream: each frame has 8-byte header (type[1] + padding[3] + size[4])
      // We need to demux to extract only the payload bytes
      stream.on('data', (chunk: Buffer) => {
        let offset = 0;
        while (offset < chunk.length) {
          if (offset + 8 > chunk.length) break;
          const size = chunk.readUInt32BE(offset + 4);
          if (offset + 8 + size > chunk.length) {
            // Partial frame — take what's available
            stdoutChunks.push(chunk.subarray(offset + 8));
            break;
          }
          stdoutChunks.push(chunk.subarray(offset + 8, offset + 8 + size));
          offset += 8 + size;
        }
      });
      stream.on('end', resolve);
      setTimeout(resolve, 5000);
    });

    const htpasswdLine = Buffer.concat(stdoutChunks).toString('utf-8').trim();

    // Write .htpasswd file
    const htpasswdTar = createTarBuffer('.htpasswd', htpasswdLine + '\n');
    await container.putArchive(htpasswdTar, { path: '/var/www/html/' });

    // Write marker file with scope info
    const markerTar = createTarBuffer('.wpl-password-protect', `${protectScope}\n`);
    await container.putArchive(markerTar, { path: '/var/www/html/' });

    // Generate .htaccess rules based on scope
    let htaccessContent = '';
    if (protectScope === 'frontend') {
      // Protect frontend only — exclude wp-admin and wp-login
      htaccessContent = `# WP Launcher Password Protection
AuthType Basic
AuthName "Password Required"
AuthUserFile /var/www/html/.htpasswd
Require valid-user

SetEnvIf Request_URI "^/wp-admin" noauth
SetEnvIf Request_URI "^/wp-login" noauth
SetEnvIf Request_URI "^/wp-json" noauth
SetEnvIf Request_URI "^/wp-cron" noauth
Satisfy any
Order allow,deny
Allow from env=noauth
# END WP Launcher Password Protection
`;
    } else if (protectScope === 'admin') {
      // Protect wp-admin only — allow frontend
      htaccessContent = `# WP Launcher Password Protection
SetEnvIf Request_URI "^/wp-admin" require_auth
SetEnvIf Request_URI "^/wp-login" require_auth

AuthType Basic
AuthName "Admin Access"
AuthUserFile /var/www/html/.htpasswd

Order allow,deny
Allow from all
Deny from env=require_auth
Satisfy any

<If "reqenv('require_auth') == 'require_auth'">
  Require valid-user
</If>
# END WP Launcher Password Protection
`;
    } else {
      // Protect entire site
      htaccessContent = `# WP Launcher Password Protection
AuthType Basic
AuthName "Password Required"
AuthUserFile /var/www/html/.htpasswd
Require valid-user
# END WP Launcher Password Protection
`;
    }

    const htaccessTar = createTarBuffer('.wpl-htaccess-auth', htaccessContent);
    await container.putArchive(htaccessTar, { path: '/var/www/html/' });

    // Remove old rules if present, then append new ones
    const appendExec = await container.exec({
      Cmd: ['bash', '-c', 'sed -i "/# WP Launcher Password Protection/,/# END WP Launcher Password Protection/d" /var/www/html/.htaccess 2>/dev/null; cat /var/www/html/.wpl-htaccess-auth >> /var/www/html/.htaccess'],
      AttachStdout: true, AttachStderr: true,
    });
    const appendStream = await appendExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => { appendStream.on('end', resolve); setTimeout(resolve, 5000); });

    console.log(`[provisioner] Password protection (${protectScope}) set for ${req.params.id.slice(0, 12)}`);
    res.json({ status: 'set', scope: protectScope });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] site-password error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Check if password protection is active
app.get('/containers/:id/site-password', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const exec = await container.exec({
      Cmd: ['bash', '-c', 'cat /var/www/html/.wpl-password-protect 2>/dev/null || echo ""'],
      AttachStdout: true, AttachStderr: true,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', resolve);
      setTimeout(resolve, 3000);
    });
    const content = Buffer.concat(chunks).toString('utf-8').replace(/[\x00-\x08]/g, '').trim();
    const isProtected = content !== '';
    const scope = isProtected ? content : null;

    res.json({ protected: isProtected, scope });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    res.status(500).json({ error: err.message });
  }
});

// --- Export Site as ZIP ---

app.post('/containers/:id/export-zip', async (req: Request, res: Response) => {
  try {
    if (!validateContainerId(req.params.id)) {
      res.status(400).json({ error: 'Invalid container ID format' });
      return;
    }

    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    if (!info.State.Running) {
      res.status(400).json({ error: 'Container is not running' });
      return;
    }

    const dbEngine = info.Config.Env?.find((e: string) => e.startsWith('DB_ENGINE='))?.split('=')[1] || 'sqlite';
    const exportId = `export-${Date.now()}`;
    const exportDir = path.join(SNAPSHOTS_DIR, exportId);
    fs.mkdirSync(exportDir, { recursive: true });

    // Step 1: DB dump
    if (dbEngine === 'mysql' || dbEngine === 'mariadb') {
      const dbHost = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_HOST='))?.split('=')[1];
      const dbUser = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_USER='))?.split('=')[1] || 'wordpress';
      const dbPass = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_PASSWORD='))?.split('=')[1] || '';
      const dbName = info.Config.Env?.find((e: string) => e.startsWith('WORDPRESS_DB_NAME='))?.split('=')[1] || 'wordpress';

      const dumpExec = await container.exec({
        Cmd: ['bash', '-c', `mysqldump -h "${dbHost}" -u "${dbUser}" -p"${dbPass}" "${dbName}" > /tmp/db-export.sql 2>/dev/null`],
        AttachStdout: true, AttachStderr: true,
      });
      const dumpStream = await dumpExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => { dumpStream.on('end', resolve); setTimeout(resolve, 60000); });
    } else {
      // SQLite: use wp db export
      const dumpExec = await container.exec({
        Cmd: ['bash', '-c', 'wp db export /tmp/db-export.sql --allow-root 2>/dev/null'],
        AttachStdout: true, AttachStderr: true,
      });
      const dumpStream = await dumpExec.start({ hijack: true, stdin: false });
      await new Promise<void>((resolve) => { dumpStream.on('end', resolve); setTimeout(resolve, 30000); });
    }

    // Step 2: Create tar.gz of wp-content + db dump (tar is always available, zip is not)
    const tarExec = await container.exec({
      Cmd: ['bash', '-c', 'cd /var/www/html && tar czf /tmp/site-export.tar.gz --exclude="wp-content/mu-plugins" wp-content/ -C /tmp db-export.sql 2>/dev/null'],
      AttachStdout: true, AttachStderr: true,
    });
    const tarStream = await tarExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => { tarStream.on('end', resolve); setTimeout(resolve, 120000); });

    // Step 3: Extract archive from container using getArchive (returns a tar wrapping our tar.gz)
    const archiveStream = await container.getArchive({ path: '/tmp/site-export.tar.gz' });
    const exportPath = path.join(exportDir, 'site-export.tar.gz');

    // getArchive wraps the file in a tar stream — extract the inner file
    const outerChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      archiveStream.on('data', (chunk: Buffer) => outerChunks.push(chunk));
      archiveStream.on('end', resolve);
      archiveStream.on('error', reject);
      setTimeout(resolve, 120000);
    });

    const outerTar = Buffer.concat(outerChunks);
    // Tar header is 512 bytes; file size at bytes 124-135 (octal)
    const sizeOctal = outerTar.subarray(124, 136).toString('ascii').trim();
    const fileSize = parseInt(sizeOctal, 8);
    const innerData = outerTar.subarray(512, 512 + fileSize);
    fs.writeFileSync(exportPath, innerData);

    // Cleanup inside container
    const cleanExec = await container.exec({
      Cmd: ['rm', '-f', '/tmp/site-export.tar.gz', '/tmp/db-export.sql'],
      AttachStdout: true, AttachStderr: true,
    });
    const cleanStream = await cleanExec.start({ hijack: true, stdin: false });
    await new Promise<void>((resolve) => { cleanStream.on('end', resolve); setTimeout(resolve, 5000); });

    const stats = fs.statSync(exportPath);
    console.log(`[provisioner] Site exported for ${req.params.id.slice(0, 12)}: ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

    res.json({
      exportId,
      path: exportPath,
      sizeBytes: stats.size,
      dbEngine,
    });
  } catch (err: any) {
    if (err.statusCode === 404) {
      res.status(404).json({ error: 'Container not found' });
      return;
    }
    console.error('[provisioner] export-zip error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Download an exported ZIP file
app.get('/exports/:exportId/download', (req: Request, res: Response) => {
  const { exportId } = req.params;
  if (!/^export-\d+$/.test(exportId)) {
    res.status(400).json({ error: 'Invalid export ID' });
    return;
  }

  const exportPath = path.join(SNAPSHOTS_DIR, exportId, 'site-export.tar.gz');
  if (!fs.existsSync(exportPath)) {
    res.status(404).json({ error: 'Export not found' });
    return;
  }

  res.download(exportPath, 'site-export.tar.gz', (err) => {
    if (err) {
      console.error('[provisioner] download error:', err.message);
    }
    // Cleanup: delete the export after download
    try {
      fs.rmSync(path.join(SNAPSHOTS_DIR, exportId), { recursive: true, force: true });
    } catch {}
  });
});

// ── Public Sharing (Tunnel Containers) ──

const SHARE_IMAGES: Record<string, string> = {
  lan: 'alpine/socat',
  cloudflare: 'cloudflare/cloudflared:latest',
  ngrok: 'ngrok/ngrok:latest',
};

async function pullImageIfNeeded(image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
  } catch {
    console.log(`[provisioner] Pulling ${image}...`);
    const stream = await docker.pull(image);
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err); else resolve();
      });
    });
    console.log(`[provisioner] ${image} pulled.`);
  }
}

async function findShareContainer(subdomain: string): Promise<Docker.ContainerInfo | null> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: [`wp-launcher.share.site-subdomain=${subdomain}`] },
  });
  return containers[0] || null;
}

// Create a share tunnel
app.post('/shares', async (req: Request, res: Response) => {
  try {
    const { subdomain, method, ngrokAuthToken } = req.body;
    if (!subdomain || !method || !['lan', 'cloudflare', 'ngrok'].includes(method)) {
      res.status(400).json({ error: 'subdomain and method (lan|cloudflare|ngrok) are required' });
      return;
    }
    if (method === 'ngrok' && !ngrokAuthToken) {
      res.status(400).json({ error: 'ngrokAuthToken is required for ngrok sharing' });
      return;
    }

    // Check site container exists
    const siteContainerName = `wp-demo-${subdomain}`;
    try {
      const siteInfo = await docker.getContainer(siteContainerName).inspect();
      if (!siteInfo.State.Running) {
        res.status(400).json({ error: 'Site container is not running' });
        return;
      }
    } catch {
      res.status(404).json({ error: 'Site container not found' });
      return;
    }

    // Check for existing share
    const existing = await findShareContainer(subdomain);
    if (existing) {
      res.status(409).json({ error: 'Site already has an active share. Remove it first.' });
      return;
    }

    const image = SHARE_IMAGES[method];
    await pullImageIfNeeded(image);

    const shareContainerName = `wp-share-${subdomain}`;
    const labels: Record<string, string> = {
      'wp-launcher.share': 'true',
      'wp-launcher.share.site-subdomain': subdomain,
      'wp-launcher.share.method': method,
      'traefik.enable': 'false',
    };

    let containerConfig: any;

    if (method === 'lan') {
      containerConfig = {
        Image: image,
        name: shareContainerName,
        Cmd: ['TCP-LISTEN:80,fork,reuseaddr', `TCP:${siteContainerName}:80`],
        Labels: labels,
        ExposedPorts: { '80/tcp': {} },
        HostConfig: {
          NetworkMode: DOCKER_NETWORK,
          PortBindings: { '80/tcp': [{ HostPort: '0' }] },
          RestartPolicy: { Name: 'no' as const },
        },
      };
    } else if (method === 'cloudflare') {
      containerConfig = {
        Image: image,
        name: shareContainerName,
        Cmd: ['tunnel', '--url', `http://${siteContainerName}:80`],
        Labels: labels,
        HostConfig: {
          NetworkMode: DOCKER_NETWORK,
          RestartPolicy: { Name: 'no' as const },
        },
      };
    } else {
      containerConfig = {
        Image: image,
        name: shareContainerName,
        Cmd: ['http', `http://${siteContainerName}:80`],
        Env: [`NGROK_AUTHTOKEN=${ngrokAuthToken}`],
        Labels: labels,
        HostConfig: {
          NetworkMode: DOCKER_NETWORK,
          RestartPolicy: { Name: 'no' as const },
        },
      };
    }

    const container = await docker.createContainer(containerConfig);
    await container.start();
    console.log(`[provisioner] Share container ${shareContainerName} started (${method})`);

    res.status(201).json({ containerId: container.id, method });
  } catch (err: any) {
    console.error('[provisioner] share create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get share status and URL
app.get('/shares/:subdomain', async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const info = await findShareContainer(subdomain);
    if (!info) {
      res.json({ active: false });
      return;
    }

    const method = info.Labels['wp-launcher.share.method'];
    const container = docker.getContainer(info.Id);
    const inspect = await container.inspect();

    if (!inspect.State.Running) {
      res.json({ active: false, method, status: 'stopped' });
      return;
    }

    let url: string | null = null;

    if (method === 'lan') {
      const portBindings = inspect.NetworkSettings.Ports?.['80/tcp'];
      const hostPort = portBindings?.[0]?.HostPort;
      if (hostPort) {
        // Get gateway IP (host machine's Docker bridge IP)
        try {
          const network = docker.getNetwork(DOCKER_NETWORK);
          const netInfo = await network.inspect();
          const gateway = netInfo.IPAM?.Config?.[0]?.Gateway || 'localhost';
          url = `http://${gateway}:${hostPort}`;
        } catch {
          url = `http://localhost:${hostPort}`;
        }
      }
    } else if (method === 'cloudflare') {
      // Parse logs for trycloudflare.com URL
      try {
        const logs = await container.logs({ stdout: true, stderr: true, follow: false, tail: 50 });
        const logStr = logs.toString();
        const match = logStr.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match) url = match[0];
      } catch {}
    } else if (method === 'ngrok') {
      // Query ngrok API
      try {
        const ngrokApiUrl = `http://wp-share-${subdomain}:4040/api/tunnels`;
        const resp = await fetch(ngrokApiUrl);
        if (resp.ok) {
          const data = await resp.json() as any;
          if (data.tunnels?.[0]?.public_url) {
            url = data.tunnels[0].public_url;
          }
        }
      } catch {}
    }

    res.json({
      active: true,
      method,
      url,
      containerId: info.Id,
      status: url ? 'ready' : 'connecting',
    });
  } catch (err: any) {
    console.error('[provisioner] share status error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove share tunnel
app.delete('/shares/:subdomain', async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params;
    const info = await findShareContainer(subdomain);
    if (!info) {
      res.json({ status: 'not_found' });
      return;
    }

    const container = docker.getContainer(info.Id);
    try { await container.stop({ t: 2 }); } catch {}
    try { await container.remove({ force: true }); } catch {}
    console.log(`[provisioner] Share container wp-share-${subdomain} removed`);

    res.json({ status: 'removed' });
  } catch (err: any) {
    console.error('[provisioner] share remove error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Prune dangling images (old build layers from docker compose build)
app.post('/images/prune', async (_req: Request, res: Response) => {
  try {
    const result = await docker.pruneImages({ filters: { dangling: { true: true } } });
    const count = result.ImagesDeleted?.length || 0;
    const space = result.SpaceReclaimed || 0;
    if (count > 0) {
      console.log(`[provisioner] Pruned ${count} dangling image(s), reclaimed ${(space / 1024 / 1024).toFixed(1)}MB`);
    }
    res.json({ pruned: count, spaceReclaimed: space });
  } catch (err: any) {
    console.error('[provisioner] image prune error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[provisioner] Running on port ${PORT}`);
});
