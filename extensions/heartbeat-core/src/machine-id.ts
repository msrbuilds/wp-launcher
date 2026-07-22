import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Get a stable machine identifier from the OS.
 * Falls back to a persisted random UUID in ~/.wpl-machine-id.
 */
export function getMachineId(): string {
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      const result = cp.execSync(
        'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
        { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const match = result.toString().match(/MachineGuid\s+REG_SZ\s+(.+)/);
      if (match) return match[1].trim();
    } else if (platform === 'darwin') {
      const result = cp.execSync(
        'ioreg -rd1 -c IOPlatformExpertDevice',
        { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      );
      const match = result.toString().match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } else {
      // Linux
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf8').trim();
        }
      }
    }
  } catch {
    // Fall through to persisted random ID
  }

  return getPersistedFallbackId();
}

function getPersistedFallbackId(): string {
  const idFile = path.join(os.homedir(), '.wpl-machine-id');
  try {
    if (fs.existsSync(idFile)) {
      return fs.readFileSync(idFile, 'utf8').trim();
    }
  } catch {
    // ignore
  }

  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(idFile, id, 'utf8');
  } catch {
    // ignore — return the ID anyway
  }
  return id;
}
