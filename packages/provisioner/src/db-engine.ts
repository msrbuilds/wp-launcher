import type Docker from 'dockerode';
import {
  SharedDbEngine, engineHost, engineImage, engineVolume, ENGINE_FLAGS,
} from './shared-db';

const READY_TIMEOUT_MS = 60_000;
const READY_POLL_MS = 1_000;

/** Run a command inside the engine container and return its stdout. */
async function execInEngine(
  docker: Docker, engine: SharedDbEngine, cmd: string[],
): Promise<string> {
  const container = docker.getContainer(engineHost(engine));
  const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
  const stream = await exec.start({});
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c: Buffer) => chunks.push(c));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  const info = await exec.inspect();
  // Docker multiplexes exec output with an 8-byte header per frame; strip any
  // leading non-printable bytes rather than parsing the framing.
  const out = Buffer.concat(chunks).toString('utf-8').replace(/^[\x00-\x08]+/gm, '');
  if (info.ExitCode !== 0) {
    throw new Error(`${cmd[0]} failed in ${engineHost(engine)} (exit ${info.ExitCode}): ${out.trim()}`);
  }
  return out;
}

async function sql(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, statement: string,
): Promise<string> {
  return await execInEngine(docker, engine, [
    'mysql', '--skip-ssl', '-u', 'root', `-p${rootPassword}`, '--batch', '--skip-column-names',
    '-e', statement,
  ]);
}

/**
 * Start the shared engine if it is not already running, and prove we can
 * authenticate against it.
 *
 * The engine is stopped rather than removed when idle, so an existing
 * container is normal and is simply started again.
 */
export async function ensureEngineRunning(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, network: string,
): Promise<void> {
  const name = engineHost(engine);
  let container = docker.getContainer(name);
  let exists = true;
  try {
    const info = await container.inspect();
    if (!info.State.Running) await container.start();
  } catch (err: any) {
    if (err.statusCode !== 404) throw err;
    exists = false;
  }

  if (!exists) {
    const image = engineImage(engine);
    try {
      await docker.getImage(image).inspect();
    } catch {
      console.log(`[provisioner] Pulling ${image}...`);
      const stream = await docker.pull(image);
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (e: Error | null) => (e ? reject(e) : resolve()));
      });
    }
    const created = await docker.createContainer({
      Image: image,
      name,
      Cmd: [...ENGINE_FLAGS],
      Env: [
        `MARIADB_ROOT_PASSWORD=${rootPassword}`,
        `MYSQL_ROOT_PASSWORD=${rootPassword}`,
      ],
      Labels: {
        'wp-launcher.managed': 'true',
        'wp-launcher.role': 'shared-db',
        'wp-launcher.db-engine': engine,
      },
      HostConfig: {
        NetworkMode: network,
        Binds: [`${engineVolume(engine)}:/var/lib/mysql`],
        RestartPolicy: { Name: 'unless-stopped' },
      },
    });
    await created.start();
    container = created;
    console.log(`[provisioner] Started shared engine ${name}`);
  }

  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      await sql(docker, engine, rootPassword, 'SELECT 1');
      return;
    } catch (err: any) {
      lastError = err.message || String(err);
      // An access-denied failure will never resolve by waiting: the password
      // was written into the volume when it was first initialised and editing
      // the environment variable does not change it.
      if (/access denied/i.test(lastError)) {
        throw new Error(
          `SHARED_DB_ROOT_PASSWORD does not match the running ${engine} server. The password was ` +
          `set when the ${engineVolume(engine)} volume was initialised and cannot be changed by ` +
          `editing this variable. Either restore the previous value, or remove that volume — ` +
          `which destroys every site database on this engine.`,
        );
      }
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
  }
  throw new Error(`database engine ${engine} did not become ready within 60s: ${lastError}`);
}

// Backtick-quoting an identifier inside a TS template literal needs escaping
// that is easy to get wrong and silently produces invalid SQL. Build it by
// concatenation instead, where what you read is what MySQL receives.
const BT = String.fromCharCode(96);
const quoted = (identifier: string) => BT + identifier + BT;

export async function provisionSiteDatabase(
  docker: Docker, engine: SharedDbEngine, rootPassword: string,
  identifier: string, password: string,
): Promise<void> {
  await sql(docker, engine, rootPassword, [
    'CREATE DATABASE IF NOT EXISTS ' + quoted(identifier) + ';',
    `CREATE USER IF NOT EXISTS '${identifier}'@'%' IDENTIFIED BY '${password}';`,
    `ALTER USER '${identifier}'@'%' IDENTIFIED BY '${password}';`,
    'GRANT ALL PRIVILEGES ON ' + quoted(identifier) + `.* TO '${identifier}'@'%';`,
    `ALTER USER '${identifier}'@'%' WITH MAX_USER_CONNECTIONS 10;`,
    'FLUSH PRIVILEGES;',
  ].join(' '));
}

export async function dropSiteDatabase(
  docker: Docker, engine: SharedDbEngine, rootPassword: string, identifier: string,
): Promise<void> {
  await sql(docker, engine, rootPassword, [
    'DROP DATABASE IF EXISTS ' + quoted(identifier) + ';',
    `DROP USER IF EXISTS '${identifier}'@'%';`,
  ].join(' '));
}

export async function listSiteDatabases(
  docker: Docker, engine: SharedDbEngine, rootPassword: string,
): Promise<string[]> {
  const out = await sql(docker, engine, rootPassword, 'SHOW DATABASES;');
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * Stop the engine when no site container references it. Stopped, not removed:
 * the volume and tuning survive, and the next start is fast.
 */
export async function stopEngineIfUnused(docker: Docker, engine: SharedDbEngine): Promise<void> {
  const sites = await docker.listContainers({
    all: true,
    filters: { label: [`wp-launcher.db-engine=${engine}`, 'wp-launcher.managed=true'] },
  });
  const stillUsed = sites.some((c) => c.Labels?.['wp-launcher.role'] !== 'shared-db');
  if (stillUsed) return;
  try {
    await docker.getContainer(engineHost(engine)).stop({ t: 10 });
    console.log(`[provisioner] Stopped idle shared engine ${engineHost(engine)}`);
  } catch (err: any) {
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }
}
