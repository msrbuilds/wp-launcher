import { execSync, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

// Resolve project directory
export function getProjectDir(): string {
  // Check WPL_DIR env var first
  if (process.env.WPL_DIR) return process.env.WPL_DIR;

  // Walk up from this script's location to find docker-compose.yml
  let dir = path.resolve(import.meta.dirname, '..', '..', '..');
  if (existsSync(path.join(dir, 'docker-compose.yml'))) return dir;

  // Fallback: cwd
  dir = process.cwd();
  if (existsSync(path.join(dir, 'docker-compose.yml'))) return dir;

  console.error('Error: Could not find WP Launcher project directory.');
  console.error('Set WPL_DIR environment variable or run from the project directory.');
  process.exit(1);
}

export function isLocalMode(projectDir: string): boolean {
  try {
    const envPath = path.join(projectDir, '.env');
    if (!existsSync(envPath)) return false;
    const content = require('fs').readFileSync(envPath, 'utf8');
    return content.includes('APP_MODE=local');
  } catch {
    return false;
  }
}

export function getComposeArgs(projectDir: string): string[] {
  const args = ['-f', path.join(projectDir, 'docker-compose.yml')];
  const localFile = path.join(projectDir, 'docker-compose.local.yml');
  if (existsSync(localFile) && isLocalMode(projectDir)) {
    args.push('-f', localFile);
  }
  return args;
}

export function dockerCompose(projectDir: string, cmd: string[], opts?: { stdio?: 'inherit' | 'pipe' }): string {
  const composeArgs = getComposeArgs(projectDir);
  const fullCmd = ['docker', 'compose', ...composeArgs, ...cmd].join(' ');
  try {
    const result = execSync(fullCmd, {
      stdio: opts?.stdio || 'pipe',
      encoding: 'utf8',
      cwd: projectDir,
    });
    return result || '';
  } catch (err: any) {
    if (opts?.stdio === 'inherit') throw err;
    return err.stdout || err.message || '';
  }
}

export function dockerComposeStream(projectDir: string, cmd: string[]): void {
  const composeArgs = getComposeArgs(projectDir);
  const child = spawn('docker', ['compose', ...composeArgs, ...cmd], {
    stdio: 'inherit',
    cwd: projectDir,
    shell: true,
  });
  child.on('exit', (code) => process.exit(code || 0));
}

export function isDockerRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function startDockerDesktop(): boolean {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      const paths = [
        path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
      ];
      for (const p of paths) {
        if (existsSync(p)) {
          spawn(p, [], { detached: true, stdio: 'ignore' }).unref();
          return true;
        }
      }
    } else if (platform === 'darwin') {
      execSync('open -a Docker', { stdio: 'pipe' });
      return true;
    } else {
      execSync('sudo systemctl start docker', { stdio: 'pipe' });
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

export async function ensureDocker(): Promise<void> {
  if (isDockerRunning()) return;

  process.stdout.write('Docker is not running. Starting Docker Desktop...\n');
  if (!startDockerDesktop()) {
    console.error('Error: Could not find Docker Desktop. Please start it manually.');
    process.exit(1);
  }

  process.stdout.write('Waiting for Docker');
  for (let i = 0; i < 30; i++) {
    if (isDockerRunning()) {
      process.stdout.write(' ready!\n');
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  process.stdout.write('\n');
  console.error('Error: Docker did not start in time.');
  process.exit(1);
}

export interface ContainerInfo {
  name: string;
  service: string;
  status: string;
  state: string;
  ports: string;
}

export function getContainerStatus(projectDir: string): ContainerInfo[] {
  try {
    const output = dockerCompose(projectDir, [
      'ps', '--format', 'json',
    ]);
    if (!output.trim()) return [];
    // docker compose ps --format json outputs one JSON object per line
    return output.trim().split('\n').filter(Boolean).map((line) => {
      const obj = JSON.parse(line);
      return {
        name: obj.Name || obj.name || '',
        service: obj.Service || obj.service || '',
        status: obj.Status || obj.status || '',
        state: obj.State || obj.state || '',
        ports: obj.Ports || obj.ports || '',
      };
    });
  } catch {
    return [];
  }
}

export interface SiteInfo {
  id: string;
  subdomain: string;
  status: string;
  site_url: string;
  admin_url: string;
  product_id: string;
  created_at: string;
  expires_at: string;
}

export interface ContainerStats {
  name: string;
  cpu: string;
  memory: string;
  memUsage: string;
  netIO: string;
  pids: string;
}

export function getContainerStats(): ContainerStats[] {
  try {
    const output = execSync(
      'docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.PIDs}}"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
    );
    if (!output.trim()) return [];
    return output.trim().split('\n').filter(Boolean).map((line) => {
      const [name, cpu, memory, memUsage, netIO, pids] = line.split('|');
      return { name, cpu, memory, memUsage, netIO, pids };
    });
  } catch {
    return [];
  }
}

export function getWpContainerStats(): ContainerStats[] {
  try {
    // Get wp-launcher managed containers + infrastructure
    const ids = execSync(
      'docker ps --format "{{.ID}}" --filter "label=com.docker.compose.project"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 }
    ).trim();
    if (!ids) return [];
    const idList = ids.split('\n').filter(Boolean).join(' ');
    const output = execSync(
      `docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.PIDs}}" ${idList}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000 }
    );
    if (!output.trim()) return [];
    return output.trim().split('\n').filter(Boolean).map((line) => {
      const [name, cpu, memory, memUsage, netIO, pids] = line.split('|');
      return { name, cpu, memory, memUsage, netIO, pids };
    });
  } catch {
    return [];
  }
}

export async function getSites(): Promise<SiteInfo[]> {
  try {
    const res = await fetch('http://localhost:3000/api/sites');
    if (!res.ok) {
      const res2 = await fetch('http://localhost/api/sites');
      if (!res2.ok) return [];
      const data = await res2.json() as any;
      return data.sites || [];
    }
    const data = await res.json() as any;
    return data.sites || [];
  } catch {
    return [];
  }
}
