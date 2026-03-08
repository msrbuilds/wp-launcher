#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import path from 'path';
import {
  getProjectDir,
  ensureDocker,
  dockerCompose,
  dockerComposeStream,
  getContainerStatus,
  getSites,
} from './docker.js';
import {
  renderStatus,
  renderSites,
  renderHelp,
  printSuccess,
  printError,
  printInfo,
} from './ui.js';
import { startDashboard } from './dashboard.js';

const PROJECT_DIR = getProjectDir();
const cmd = process.argv[2] || 'dashboard';
const args = process.argv.slice(3);

async function main() {
  switch (cmd) {
    case 'dashboard':
    case 'dash': {
      await startDashboard();
      break;
    }

    case 'start': {
      await ensureDocker();
      printInfo('Starting WP Launcher...');
      dockerCompose(PROJECT_DIR, ['up', '-d', ...args], { stdio: 'inherit' });
      printSuccess('Running at http://localhost');
      break;
    }

    case 'stop': {
      await ensureDocker();
      printInfo('Stopping WP Launcher...');
      dockerCompose(PROJECT_DIR, ['down', ...args], { stdio: 'inherit' });
      printSuccess('All services stopped');
      break;
    }

    case 'restart': {
      await ensureDocker();
      printInfo('Restarting WP Launcher...');
      dockerCompose(PROJECT_DIR, ['restart', ...args], { stdio: 'inherit' });
      printSuccess('All services restarted');
      break;
    }

    case 'rebuild': {
      await ensureDocker();
      printInfo('Rebuilding and restarting WP Launcher...');
      dockerCompose(PROJECT_DIR, ['up', '-d', '--build', ...args], { stdio: 'inherit' });
      printSuccess('Rebuild complete');
      break;
    }

    case 'status':
    case 'ps': {
      await ensureDocker();
      const containers = getContainerStatus(PROJECT_DIR);
      renderStatus(containers);
      break;
    }

    case 'logs': {
      await ensureDocker();
      dockerComposeStream(PROJECT_DIR, ['logs', '-f', ...args]);
      break;
    }

    case 'sites': {
      const sites = await getSites();
      renderSites(sites);
      break;
    }

    case 'build:wp': {
      await ensureDocker();
      printInfo('Building WordPress images (all PHP versions)...');
      const script = path.join(PROJECT_DIR, 'scripts', 'build-wp-image.sh');
      execSync(`bash "${script}" ${args.join(' ')}`, { stdio: 'inherit', cwd: PROJECT_DIR });
      printSuccess('All WordPress images built');
      break;
    }

    case 'shell': {
      await ensureDocker();
      const subdomain = args[0];
      if (!subdomain) {
        printError('Usage: wpl shell <subdomain>');
        console.log('');
        printInfo('Running WordPress containers:');
        try {
          execSync('docker ps --filter "label=wp-launcher.managed=true" --format "  {{.Names}}"', { stdio: 'inherit' });
        } catch { /* ignore */ }
        process.exit(1);
      }
      const child = spawn('docker', ['exec', '-it', `wp-demo-${subdomain}`, 'bash'], {
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', (code) => process.exit(code || 0));
      break;
    }

    case 'wp': {
      await ensureDocker();
      const subdomain = args[0];
      if (!subdomain) {
        printError('Usage: wpl wp <subdomain> <wp-cli command...>');
        console.log('  Example: wpl wp coral-sunset-7x3k plugin list');
        console.log('');
        printInfo('Running WordPress containers:');
        try {
          execSync('docker ps --filter "label=wp-launcher.managed=true" --format "  {{.Names}}"', { stdio: 'inherit' });
        } catch { /* ignore */ }
        process.exit(1);
      }
      const wpArgs = args.slice(1);
      const child = spawn('docker', ['exec', '-it', `wp-demo-${subdomain}`, 'wp', '--allow-root', ...wpArgs], {
        stdio: 'inherit',
        shell: true,
      });
      child.on('exit', (code) => process.exit(code || 0));
      break;
    }

    case 'open': {
      const target = args[0] || 'dashboard';
      let url: string;
      if (target === 'dashboard') url = 'http://localhost';
      else if (target === 'mail' || target === 'mailpit') url = 'http://localhost:8025';
      else url = `http://${target}.localhost`;

      printInfo(`Opening ${url}...`);
      const platform = process.platform;
      try {
        if (platform === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore' });
        else if (platform === 'darwin') execSync(`open ${url}`, { stdio: 'ignore' });
        else execSync(`xdg-open ${url}`, { stdio: 'ignore' });
      } catch {
        console.log(`  ${url}`);
      }
      break;
    }

    case 'dir': {
      console.log(PROJECT_DIR);
      break;
    }

    case 'help':
    case '--help':
    case '-h': {
      renderHelp();
      break;
    }

    default: {
      printError(`Unknown command: ${cmd}`);
      console.log("Run 'wpl help' for available commands.");
      process.exit(1);
    }
  }
}

main().catch((err) => {
  printError(err.message);
  process.exit(1);
});
