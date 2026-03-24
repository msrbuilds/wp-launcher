import { execSync, spawn } from 'child_process';
import * as readline from 'readline';
import {
  getProjectDir,
  getContainerStatus,
  getWpContainerStats,
  getSites,
  dockerCompose,
  isDockerRunning,
  ensureDocker,
} from './docker.js';
import type { ContainerInfo, ContainerStats, SiteInfo } from './docker.js';

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const ESC = '\x1b';
const CSI = `${ESC}[`;

const ansi = {
  altScreen: `${CSI}?1049h`,
  mainScreen: `${CSI}?1049l`,
  hideCursor: `${CSI}?25l`,
  showCursor: `${CSI}?25h`,
  clear: `${CSI}2J${CSI}H`,
  moveTo: (x: number, y: number) => `${CSI}${y};${x}H`,
  clearLine: `${CSI}2K`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  reset: `${CSI}0m`,
  fg: {
    black: `${CSI}38;2;0;0;0m`,       // true #000000 black
    red: `${CSI}31m`,
    green: `${CSI}32m`,
    yellow: `${CSI}33m`,
    blue: `${CSI}34m`,
    magenta: `${CSI}35m`,
    cyan: `${CSI}36m`,
    white: `${CSI}37m`,
    gray: `${CSI}90m`,
    orange: `${CSI}38;5;208m`,      // #fb8500 brand orange
    darkOrange: `${CSI}38;5;172m`,   // muted orange for borders
  },
  bg: {
    black: `${CSI}40m`,
    red: `${CSI}41m`,
    green: `${CSI}42m`,
    yellow: `${CSI}43m`,
    blue: `${CSI}44m`,
    magenta: `${CSI}45m`,
    cyan: `${CSI}46m`,
    white: `${CSI}47m`,
    orange: `${CSI}48;5;208m`,       // brand orange bg
  },
};

// Box-drawing (rounded)
const B = {
  tl: '\u256d', tr: '\u256e', bl: '\u2570', br: '\u256f',
  h: '\u2500', v: '\u2502',
  ltee: '\u251c', rtee: '\u2524',
  cross: '\u253c',
};

// ── String helpers ───────────────────────────────────────────────────────────

function stripAnsi(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(str: string, len: number): string {
  const visible = stripAnsi(str);
  return str + ' '.repeat(Math.max(0, len - visible));
}

function truncStr(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + '\u2026';
}

function centerText(str: string, width: number): string {
  const visible = stripAnsi(str);
  const leftPad = Math.floor((width - visible) / 2);
  return ' '.repeat(Math.max(0, leftPad)) + str;
}

// ── Drawing primitives ───────────────────────────────────────────────────────

function hLine(width: number, title?: string): string {
  if (!title) return B.h.repeat(width);
  const t = ` ${title} `;
  return t + B.h.repeat(Math.max(0, width - t.length));
}

function topBorder(width: number, title?: string): string {
  const inner = width - 2;
  return `${ansi.fg.darkOrange}${B.tl}${hLine(inner, title)}${B.tr}${ansi.reset}`;
}

function midBorder(width: number, title?: string): string {
  const inner = width - 2;
  return `${ansi.fg.darkOrange}${B.ltee}${hLine(inner, title)}${B.rtee}${ansi.reset}`;
}

function botBorder(width: number, title?: string): string {
  const inner = width - 2;
  return `${ansi.fg.darkOrange}${B.bl}${hLine(inner, title)}${B.br}${ansi.reset}`;
}

function row(content: string, width: number): string {
  const visible = stripAnsi(content);
  const padding = Math.max(0, width - 2 - visible);
  return `${ansi.fg.darkOrange}${B.v}${ansi.reset}${content}${' '.repeat(padding)}${ansi.fg.darkOrange}${B.v}${ansi.reset}`;
}

function emptyRow(width: number): string {
  return row(' '.repeat(width - 2), width);
}

// ── Gauge bar ────────────────────────────────────────────────────────────────

function gauge(value: number, maxWidth: number, color: string): string {
  const filled = Math.round((value / 100) * maxWidth);
  const empty = maxWidth - filled;
  return `${color}${'█'.repeat(filled)}${ansi.fg.gray}${'░'.repeat(empty)}${ansi.reset}`;
}

// ── Dashboard state ──────────────────────────────────────────────────────────

interface DashboardState {
  containers: ContainerInfo[];
  stats: ContainerStats[];
  sites: SiteInfo[];
  selectedTab: number;
  siteScroll: number;
  lastRefresh: Date;
  refreshing: boolean;
  message: string;
  messageTimeout: ReturnType<typeof setTimeout> | null;
  running: boolean;
  projectDir: string;
  dockerOk: boolean;
}

const TABS = ['Sites', 'Services', 'Actions'];
const REFRESH_INTERVAL = 5000;

// ── Data fetching ────────────────────────────────────────────────────────────

async function refreshData(state: DashboardState): Promise<void> {
  state.refreshing = true;
  state.dockerOk = isDockerRunning();

  if (state.dockerOk) {
    try {
      state.containers = getContainerStatus(state.projectDir);
    } catch { state.containers = []; }

    try {
      state.stats = getWpContainerStats();
    } catch { state.stats = []; }

    try {
      state.sites = await getSites();
    } catch { state.sites = []; }
  } else {
    state.containers = [];
    state.stats = [];
    state.sites = [];
  }

  state.lastRefresh = new Date();
  state.refreshing = false;
}

function getStatForContainer(stats: ContainerStats[], name: string): ContainerStats | undefined {
  return stats.find((s) => s.name === name || name.includes(s.name) || s.name.includes(name));
}

// ── Screen rendering ─────────────────────────────────────────────────────────

function render(state: DashboardState): void {
  const W = process.stdout.columns || 100;
  const H = process.stdout.rows || 30;
  const lines: string[] = [];

  // ── Header ──
  lines.push(topBorder(W, 'WP Launcher Dashboard'));

  // Status bar
  const dockerStatus = state.dockerOk
    ? `${ansi.fg.green}\u25cf Docker running${ansi.reset}`
    : `${ansi.fg.red}\u25cf Docker stopped${ansi.reset}`;
  const svcCount = state.containers.filter((c) => c.state === 'running').length;
  const siteCount = state.sites.length;
  const time = state.lastRefresh.toLocaleTimeString();
  const refreshIcon = state.refreshing ? `${ansi.fg.yellow}\u21bb${ansi.reset}` : '';

  lines.push(row(
    ` ${dockerStatus}  ${ansi.fg.white}Services: ${ansi.bold}${svcCount}${ansi.reset}  ` +
    `${ansi.fg.white}Sites: ${ansi.bold}${siteCount}${ansi.reset}  ` +
    `${ansi.fg.gray}Updated: ${time}${ansi.reset} ${refreshIcon}`,
    W
  ));

  // ── Tabs ──
  lines.push(midBorder(W));
  const tabStr = TABS.map((t, i) => {
    if (i === state.selectedTab) {
      return `${ansi.bg.orange}${ansi.fg.black}${ansi.bold} ${t} ${ansi.reset}`;
    }
    return `${ansi.fg.orange} ${t} ${ansi.reset}`;
  }).join(`${ansi.fg.gray}│${ansi.reset}`);
  lines.push(row(` ${tabStr}`, W));
  lines.push(midBorder(W));

  // ── Tab content ──
  const contentHeight = H - lines.length - 4; // room for footer

  if (state.selectedTab === 0) {
    renderSitesTab(state, lines, W, contentHeight);
  } else if (state.selectedTab === 1) {
    renderServicesTab(state, lines, W, contentHeight);
  } else {
    renderActionsTab(state, lines, W, contentHeight);
  }

  // Fill remaining
  while (lines.length < H - 3) {
    lines.push(emptyRow(W));
  }

  // ── Message bar ──
  if (state.message) {
    lines.push(midBorder(W));
    lines.push(row(` ${ansi.fg.yellow}${state.message}${ansi.reset}`, W));
  } else {
    lines.push(midBorder(W));
    lines.push(emptyRow(W));
  }

  // ── Footer ──
  const footer = `${ansi.fg.gray}[Tab]${ansi.reset} Switch  ` +
    `${ansi.fg.gray}[R]${ansi.reset} Refresh  ` +
    `${ansi.fg.gray}[L]${ansi.reset} Launch Site  ` +
    `${ansi.fg.gray}[O]${ansi.reset} Open  ` +
    `${ansi.fg.gray}[D]${ansi.reset} Dashboard  ` +
    `${ansi.fg.gray}[M]${ansi.reset} Mail  ` +
    `${ansi.fg.gray}[Q]${ansi.reset} Quit`;
  lines.push(botBorder(W, footer));

  // Write to screen
  process.stdout.write(ansi.moveTo(1, 1));
  process.stdout.write(lines.join('\n'));
}

// ── Tab: Sites ───────────────────────────────────────────────────────────────

function renderSitesTab(state: DashboardState, lines: string[], W: number, maxRows: number): void {
  if (!state.dockerOk) {
    lines.push(row(`  ${ansi.fg.red}Docker is not running. Press [S] to start.${ansi.reset}`, W));
    return;
  }
  if (state.sites.length === 0) {
    lines.push(row(`  ${ansi.fg.gray}No active sites. Press [L] to launch one.${ansi.reset}`, W));
    return;
  }

  // Column widths
  const cw = { sub: 24, status: 10, tmpl: 12, url: Math.max(20, W - 74), cpu: 8, mem: 10 };

  // Header
  const headerStr =
    ` ${ansi.bold}${ansi.fg.white}${pad('SUBDOMAIN', cw.sub)}` +
    `${pad('STATUS', cw.status)}` +
    `${pad('TEMPLATE', cw.tmpl)}` +
    `${pad('URL', cw.url)}` +
    `${pad('CPU', cw.cpu)}` +
    `${pad('MEM', cw.mem)}${ansi.reset}`;
  lines.push(row(headerStr, W));

  // Separator
  lines.push(row(` ${ansi.fg.gray}${B.h.repeat(W - 4)}${ansi.reset}`, W));

  const visibleSites = state.sites.slice(state.siteScroll, state.siteScroll + maxRows - 2);
  for (const site of visibleSites) {
    const stat = getStatForContainer(state.stats, `wp-site-${site.subdomain}`);
    const statusColor = site.status === 'running' ? ansi.fg.green : site.status === 'expired' ? ansi.fg.red : ansi.fg.yellow;
    const cpuStr = stat?.cpu || '-';
    const memStr = stat?.memUsage?.split('/')[0]?.trim() || '-';

    const rowStr =
      ` ${ansi.fg.white}${pad(truncStr(site.subdomain, cw.sub - 1), cw.sub)}${ansi.reset}` +
      `${statusColor}${pad(site.status.toUpperCase(), cw.status)}${ansi.reset}` +
      `${ansi.fg.gray}${pad(truncStr(site.product_id || '-', cw.tmpl - 1), cw.tmpl)}${ansi.reset}` +
      `${ansi.fg.orange}${pad(truncStr(site.site_url || '-', cw.url - 1), cw.url)}${ansi.reset}` +
      `${ansi.fg.yellow}${pad(cpuStr, cw.cpu)}${ansi.reset}` +
      `${ansi.fg.magenta}${pad(memStr, cw.mem)}${ansi.reset}`;
    lines.push(row(rowStr, W));
  }

  if (state.sites.length > maxRows - 2) {
    const scrollInfo = `${state.siteScroll + 1}-${Math.min(state.siteScroll + maxRows - 2, state.sites.length)} of ${state.sites.length}`;
    lines.push(row(`  ${ansi.fg.gray}${ansi.dim}[\u2191\u2193] Scroll  ${scrollInfo}${ansi.reset}`, W));
  }
}

// ── Tab: Services ────────────────────────────────────────────────────────────

function renderServicesTab(state: DashboardState, lines: string[], W: number, maxRows: number): void {
  if (!state.dockerOk) {
    lines.push(row(`  ${ansi.fg.red}Docker is not running. Press [S] to start.${ansi.reset}`, W));
    return;
  }
  if (state.containers.length === 0) {
    lines.push(row(`  ${ansi.fg.gray}No services running. Press [S] to start WP Launcher.${ansi.reset}`, W));
    return;
  }

  const cw = { svc: 20, state: 10, status: 22, cpu: 10, mem: 12, net: Math.max(14, W - 82) };

  const headerStr =
    ` ${ansi.bold}${ansi.fg.white}${pad('SERVICE', cw.svc)}` +
    `${pad('STATE', cw.state)}` +
    `${pad('STATUS', cw.status)}` +
    `${pad('CPU', cw.cpu)}` +
    `${pad('MEMORY', cw.mem)}` +
    `${pad('NET I/O', cw.net)}${ansi.reset}`;
  lines.push(row(headerStr, W));
  lines.push(row(` ${ansi.fg.gray}${B.h.repeat(W - 4)}${ansi.reset}`, W));

  // Total CPU/MEM for gauges
  let totalCpu = 0;
  let totalMemMB = 0;

  for (const ct of state.containers) {
    const stat = getStatForContainer(state.stats, ct.name);
    const stateColor = ct.state === 'running' ? ansi.fg.green : ct.state === 'exited' ? ansi.fg.red : ansi.fg.yellow;
    const cpuStr = stat?.cpu || '-';
    const memStr = stat?.memUsage?.split('/')[0]?.trim() || '-';
    const netStr = stat?.netIO || '-';

    if (stat?.cpu) totalCpu += parseFloat(stat.cpu);
    if (stat?.memUsage) {
      const match = stat.memUsage.match(/([\d.]+)MiB/);
      if (match) totalMemMB += parseFloat(match[1]);
    }

    const rowStr =
      ` ${ansi.fg.white}${pad(truncStr(ct.service, cw.svc - 1), cw.svc)}${ansi.reset}` +
      `${stateColor}${pad(ct.state.toUpperCase(), cw.state)}${ansi.reset}` +
      `${ansi.fg.gray}${pad(truncStr(ct.status, cw.status - 1), cw.status)}${ansi.reset}` +
      `${ansi.fg.yellow}${pad(cpuStr, cw.cpu)}${ansi.reset}` +
      `${ansi.fg.magenta}${pad(memStr, cw.mem)}${ansi.reset}` +
      `${ansi.dim}${pad(truncStr(netStr, cw.net - 1), cw.net)}${ansi.reset}`;
    lines.push(row(rowStr, W));
  }

  // Resource gauges
  lines.push(emptyRow(W));
  const gaugeWidth = Math.min(30, W - 30);
  const cpuPct = Math.min(totalCpu, 100);
  const cpuColor = cpuPct > 80 ? ansi.fg.red : cpuPct > 50 ? ansi.fg.yellow : ansi.fg.green;
  lines.push(row(`  ${ansi.fg.white}CPU Total:${ansi.reset}  ${gauge(cpuPct, gaugeWidth, cpuColor)} ${ansi.bold}${totalCpu.toFixed(1)}%${ansi.reset}`, W));

  const memPct = Math.min((totalMemMB / 4096) * 100, 100); // assume 4GB
  const memColor = memPct > 80 ? ansi.fg.red : memPct > 50 ? ansi.fg.yellow : ansi.fg.green;
  lines.push(row(`  ${ansi.fg.white}Memory:${ansi.reset}     ${gauge(memPct, gaugeWidth, memColor)} ${ansi.bold}${totalMemMB.toFixed(0)} MiB${ansi.reset}`, W));
}

// ── Tab: Actions ─────────────────────────────────────────────────────────────

function renderActionsTab(state: DashboardState, lines: string[], W: number, _maxRows: number): void {
  const actions: [string, string, string][] = [
    ['L', 'Launch Site', 'Open the dashboard to create a new WordPress site'],
    ['O', 'Open Site', 'Open a site by subdomain in your browser'],
    ['D', 'Dashboard', 'Open the WP Launcher dashboard in browser'],
    ['M', 'Mailpit', 'Open the email testing interface'],
    ['S', 'Start / Restart', 'Start or restart all WP Launcher services'],
    ['X', 'Stop', 'Stop all WP Launcher services'],
    ['B', 'Build Images', 'Rebuild WordPress images for all PHP versions'],
    ['R', 'Refresh', 'Refresh dashboard data'],
    ['Q', 'Quit', 'Exit the dashboard'],
  ];

  lines.push(emptyRow(W));
  lines.push(row(`  ${ansi.bold}${ansi.fg.white}Keyboard Shortcuts${ansi.reset}`, W));
  lines.push(row(`  ${ansi.fg.gray}${B.h.repeat(W - 6)}${ansi.reset}`, W));
  lines.push(emptyRow(W));

  for (const [key, label, desc] of actions) {
    lines.push(row(
      `    ${ansi.bg.orange}${ansi.fg.black}${ansi.bold} ${key} ${ansi.reset}` +
      `  ${ansi.fg.white}${pad(label, 20)}${ansi.reset}` +
      `${ansi.fg.gray}${desc}${ansi.reset}`,
      W
    ));
  }

  lines.push(emptyRow(W));
  lines.push(row(
    `  ${ansi.fg.gray}${ansi.italic}Tip: Press [L] to open the dashboard and create a site, ` +
    `or use ${ansi.fg.orange}wpl shell <subdomain>${ansi.fg.gray} for terminal access.${ansi.reset}`,
    W
  ));
}

// ── Actions ──────────────────────────────────────────────────────────────────

function showMessage(state: DashboardState, msg: string, duration = 3000): void {
  state.message = msg;
  if (state.messageTimeout) clearTimeout(state.messageTimeout);
  state.messageTimeout = setTimeout(() => {
    state.message = '';
    render(state);
  }, duration);
}

function openUrl(url: string): void {
  try {
    const p = process.platform;
    if (p === 'win32') execSync(`start "" "${url}"`, { stdio: 'ignore' });
    else if (p === 'darwin') execSync(`open "${url}"`, { stdio: 'ignore' });
    else execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
  } catch { /* ignore */ }
}

async function handleAction(key: string, state: DashboardState): Promise<void> {
  switch (key) {
    case 'l':
      openUrl('http://localhost');
      showMessage(state, 'Opening dashboard to create a site...');
      break;

    case 'o':
      openUrl('http://localhost');
      showMessage(state, 'Opening dashboard...');
      break;

    case 'd':
      openUrl('http://localhost');
      showMessage(state, 'Opening dashboard...');
      break;

    case 'm':
      openUrl('http://localhost:8025');
      showMessage(state, 'Opening Mailpit...');
      break;

    case 's':
      showMessage(state, 'Starting WP Launcher services...', 10000);
      render(state);
      try {
        if (!state.dockerOk) {
          await ensureDocker();
        }
        dockerCompose(state.projectDir, ['up', '-d'], { stdio: 'pipe' });
        showMessage(state, '\u2713 Services started!');
        await refreshData(state);
      } catch (e: any) {
        showMessage(state, `\u2717 Failed: ${e.message}`);
      }
      break;

    case 'x':
      showMessage(state, 'Stopping WP Launcher services...', 10000);
      render(state);
      try {
        dockerCompose(state.projectDir, ['down'], { stdio: 'pipe' });
        showMessage(state, '\u2713 Services stopped.');
        await refreshData(state);
      } catch (e: any) {
        showMessage(state, `\u2717 Failed: ${e.message}`);
      }
      break;

    case 'b':
      showMessage(state, 'Building WordPress images... (this may take a while)', 30000);
      render(state);
      try {
        const script = require('path').join(state.projectDir, 'scripts', 'build-wp-image.sh');
        execSync(`bash "${script}"`, { stdio: 'pipe', cwd: state.projectDir, timeout: 300000 });
        showMessage(state, '\u2713 WordPress images rebuilt!');
      } catch (e: any) {
        showMessage(state, `\u2717 Build failed: ${e.message?.slice(0, 60)}`);
      }
      break;

    case 'r':
      showMessage(state, 'Refreshing...');
      render(state);
      await refreshData(state);
      showMessage(state, '\u2713 Data refreshed.');
      break;
  }
}

// ── Main dashboard loop ──────────────────────────────────────────────────────

export async function startDashboard(): Promise<void> {
  const projectDir = getProjectDir();

  const state: DashboardState = {
    containers: [],
    stats: [],
    sites: [],
    selectedTab: 0,
    siteScroll: 0,
    lastRefresh: new Date(),
    refreshing: false,
    message: 'Loading...',
    messageTimeout: null,
    running: true,
    projectDir,
    dockerOk: false,
  };

  // Enter alt screen
  process.stdout.write(ansi.altScreen + ansi.hideCursor + ansi.clear);

  // Initial data load
  await refreshData(state);
  state.message = '';
  render(state);

  // Auto-refresh timer
  const refreshTimer = setInterval(async () => {
    await refreshData(state);
    if (state.running) render(state);
  }, REFRESH_INTERVAL);

  // Resize handler
  const onResize = () => { if (state.running) render(state); };
  process.stdout.on('resize', onResize);

  // Keyboard input
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  const cleanup = () => {
    state.running = false;
    clearInterval(refreshTimer);
    if (state.messageTimeout) clearTimeout(state.messageTimeout);
    process.stdout.removeListener('resize', onResize);
    process.stdout.write(ansi.showCursor + ansi.mainScreen);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  };

  return new Promise<void>((resolve) => {
    process.stdin.on('keypress', async (_str: string, key: readline.Key) => {
      if (!state.running) return;

      // Ctrl+C or Q = quit
      if ((key.ctrl && key.name === 'c') || key.name === 'q') {
        cleanup();
        resolve();
        return;
      }

      // Tab = switch tabs
      if (key.name === 'tab') {
        state.selectedTab = (state.selectedTab + 1) % TABS.length;
        state.siteScroll = 0;
        render(state);
        return;
      }

      // Shift+Tab = previous tab
      if (key.shift && key.name === 'tab') {
        state.selectedTab = (state.selectedTab - 1 + TABS.length) % TABS.length;
        state.siteScroll = 0;
        render(state);
        return;
      }

      // Arrow keys for scrolling
      if (key.name === 'up' && state.siteScroll > 0) {
        state.siteScroll--;
        render(state);
        return;
      }
      if (key.name === 'down') {
        const maxVisible = (process.stdout.rows || 30) - 12;
        if (state.siteScroll + maxVisible < state.sites.length) {
          state.siteScroll++;
          render(state);
        }
        return;
      }

      // Number keys for tabs
      if (key.name === '1') { state.selectedTab = 0; render(state); return; }
      if (key.name === '2') { state.selectedTab = 1; render(state); return; }
      if (key.name === '3') { state.selectedTab = 2; render(state); return; }

      // Action keys
      const actionKeys = ['l', 'o', 'd', 'm', 's', 'x', 'b', 'r'];
      if (key.name && actionKeys.includes(key.name)) {
        await handleAction(key.name, state);
        render(state);
      }
    });
  });
}
