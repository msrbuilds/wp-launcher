import type { ContainerInfo, SiteInfo } from './docker.js';

// ANSI color helpers
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// Box-drawing characters (rounded)
const box = {
  tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f',
  h: '\u2500', v: '\u2502',
};

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - stripped.length));
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '\u2026';
}

function drawBox(title: string, content: string): string {
  const cols = Math.min(process.stdout.columns || 80, 100);
  const titleStr = title ? ` ${title} ` : '';
  const topLine = box.tl + titleStr + box.h.repeat(Math.max(0, cols - 2 - titleStr.length)) + box.tr;
  const botLine = box.bl + box.h.repeat(cols - 2) + box.br;
  return `${c.cyan}${topLine}${c.reset}\n${content}\n${c.cyan}${botLine}${c.reset}`;
}

function tableRow(cols: { text: string; width: number; color?: string }[]): string {
  const parts = cols.map(({ text, width, color }) => {
    const truncated = truncate(text, width);
    const padded = padRight(truncated, width);
    return color ? `${color}${padded}${c.reset}` : padded;
  });
  return `${c.cyan}${box.v}${c.reset} ${parts.join(' ')} ${c.cyan}${box.v}${c.reset}`;
}

function headerRow(cols: { text: string; width: number }[]): string {
  const parts = cols.map(({ text, width }) => `${c.bold}${c.white}${padRight(text, width)}${c.reset}`);
  return `${c.cyan}${box.v}${c.reset} ${parts.join(' ')} ${c.cyan}${box.v}${c.reset}`;
}

function separator(cols: number): string {
  return `${c.cyan}${box.v}${c.reset} ${c.dim}${'\u2500'.repeat(cols - 4)}${c.reset} ${c.cyan}${box.v}${c.reset}`;
}

export function renderStatus(containers: ContainerInfo[]): void {
  if (containers.length === 0) {
    printInfo('No services running. Run: wpl start');
    return;
  }

  const widths = [18, 10, 20, 24];
  const header = headerRow([
    { text: 'SERVICE', width: widths[0] },
    { text: 'STATE', width: widths[1] },
    { text: 'STATUS', width: widths[2] },
    { text: 'PORTS', width: widths[3] },
  ]);
  const sep = separator(Math.min(process.stdout.columns || 80, 100));

  const rows = containers.map((ct) => {
    const stateColor = ct.state === 'running' ? c.green : ct.state === 'exited' || ct.state === 'dead' ? c.red : c.yellow;
    return tableRow([
      { text: ct.service, width: widths[0], color: c.white },
      { text: ct.state.toUpperCase(), width: widths[1], color: stateColor },
      { text: ct.status, width: widths[2] },
      { text: ct.ports.split(',')[0]?.trim() || '-', width: widths[3], color: c.dim },
    ]);
  });

  console.log(drawBox('WP Launcher Services', [header, sep, ...rows].join('\n')));
}

export function renderSites(sites: SiteInfo[]): void {
  if (sites.length === 0) {
    printInfo('No active sites. Create one at http://localhost or run: wpl open');
    return;
  }

  const widths = [22, 10, 14, 30, 10];
  const header = headerRow([
    { text: 'SUBDOMAIN', width: widths[0] },
    { text: 'STATUS', width: widths[1] },
    { text: 'TEMPLATE', width: widths[2] },
    { text: 'URL', width: widths[3] },
    { text: 'AGE', width: widths[4] },
  ]);
  const sep = separator(Math.min(process.stdout.columns || 80, 100));

  const rows = sites.map((s) => {
    const age = getAge(s.created_at);
    const statusColor = s.status === 'running' ? c.green : s.status === 'expired' ? c.red : c.yellow;
    return tableRow([
      { text: s.subdomain, width: widths[0], color: c.white },
      { text: s.status.toUpperCase(), width: widths[1], color: statusColor },
      { text: s.product_id || '-', width: widths[2] },
      { text: s.site_url || '-', width: widths[3], color: c.cyan },
      { text: age, width: widths[4], color: c.dim },
    ]);
  });

  console.log(drawBox('Active WordPress Sites', [header, sep, ...rows].join('\n')));
}

export function renderHelp(): void {
  const commands: [string, string][] = [
    ['(no command)', 'Open interactive dashboard (default)'],
    ['start', 'Start all services (auto-starts Docker Desktop)'],
    ['stop', 'Stop all services'],
    ['restart', 'Restart all services'],
    ['rebuild', 'Rebuild and restart (after code changes)'],
    ['status', 'Show running containers'],
    ['logs [svc]', 'Tail logs (all or specific service)'],
    ['sites', 'List active WordPress sites'],
    ['open [target]', 'Open in browser (dashboard, mail, subdomain)'],
    ['shell <sub>', 'Bash into a site container'],
    ['wp <sub> ...', 'Run WP-CLI in a site container'],
    ['build:wp', 'Rebuild WordPress images (all PHP versions)'],
    ['dir', 'Print project directory path'],
    ['help', 'Show this help'],
  ];

  console.log('');
  console.log(`  ${c.bold}${c.cyan}WP Launcher CLI${c.reset}`);
  console.log(`  ${c.dim}Usage: wpl <command> [options]${c.reset}`);
  console.log('');
  console.log(`  ${c.bold}${c.white}Commands:${c.reset}`);

  for (const [cmd, desc] of commands) {
    console.log(`    ${c.cyan}${padRight(cmd, 18)}${c.reset}${desc}`);
  }

  console.log('');
  console.log(`  ${c.bold}${c.white}Examples:${c.reset}`);
  console.log(`    ${c.cyan}wpl start${c.reset}                            Start WP Launcher`);
  console.log(`    ${c.cyan}wpl logs api${c.reset}                         Tail API logs`);
  console.log(`    ${c.cyan}wpl open coral-sunset-7x3k${c.reset}           Open site in browser`);
  console.log(`    ${c.cyan}wpl wp coral-sunset-7x3k plugin list${c.reset} Run WP-CLI`);
  console.log(`    ${c.cyan}wpl shell coral-sunset-7x3k${c.reset}         SSH into container`);
  console.log('');
}

export function printSuccess(msg: string): void {
  console.log(`  ${c.green}\u2713${c.reset} ${msg}`);
}

export function printError(msg: string): void {
  console.log(`  ${c.red}\u2717${c.reset} ${msg}`);
}

export function printInfo(msg: string): void {
  console.log(`  ${c.cyan}\u2192${c.reset} ${msg}`);
}

function getAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
