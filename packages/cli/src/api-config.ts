import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** Read installation credentials without executing or exporting the .env file. */
export function localApiConfig(projectDir: string, env: NodeJS.ProcessEnv = process.env) {
  const envFile = path.join(projectDir, '.env');
  const saved = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  let apiKey = env.API_KEY || saved.API_KEY;
  if (!apiKey) {
    const secretsFile = path.join(projectDir, 'data', 'secrets.json');
    if (existsSync(secretsFile)) {
      const secrets = JSON.parse(readFileSync(secretsFile, 'utf8'));
      if (typeof secrets.apiKey === 'string') apiKey = secrets.apiKey;
    }
  }
  if (!apiKey) throw new Error('WP Launcher API key is missing. Configure API_KEY in the installation .env or run setup.');
  const port = env.API_PORT || saved.API_PORT || '3737';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('API_PORT must be a port number between 1 and 65535.');
  }
  return { apiKey, port };
}
