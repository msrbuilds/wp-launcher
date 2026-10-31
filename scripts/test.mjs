import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'wpl-tests-'));
try {
  for (const name of ['api', 'dashboard', 'provisioner', 'cli']) {
    const runner = name === 'provisioner'
      ? path.join(root, 'packages/provisioner/node_modules/vitest/vitest.mjs')
      : path.join(root, 'node_modules/vitest/vitest.mjs');
    const result = spawnSync(process.execPath, [runner, 'run'], {
      cwd: path.join(root, 'packages', name), stdio: 'inherit',
      env: {
        ...process.env,
        DATA_DIR: path.join(temporary, 'data'),
        BLUEPRINT_CONFIGS_DIR: path.join(temporary, 'blueprints'),
        PRODUCT_CONFIGS_DIR: path.join(temporary, 'products'),
        TEMPLATE_CONFIGS_DIR: path.join(temporary, 'templates'),
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
