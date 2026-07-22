import * as vscode from 'vscode';
import { fetchTodayStatsResult, formatDuration } from '@wpl/heartbeat-core';

const REFRESH_INTERVAL_MS = 60 * 1000;

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(
    private getApiUrl: () => string,
    private getApiKey: () => string = () => '',
    private getSecret: () => string = () => '',
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'wplProductivity.showStats';
    this.item.tooltip = 'WP Launcher Productivity — Click to open dashboard';
    this.item.text = '$(clock) WPL: --';
    this.item.show();
  }

  start(): void {
    this.refresh();
    this.timer = setInterval(() => {
      if (!this.disposed) this.refresh();
    }, REFRESH_INTERVAL_MS);
  }

  private async refresh(): Promise<void> {
    const apiUrl = this.getApiUrl();
    const apiKey = this.getApiKey();
    const secret = this.getSecret();
    const result = await fetchTodayStatsResult(apiUrl, apiKey, secret);

    if (result.ok) {
      this.item.text = `$(clock) WPL: ${formatDuration(result.stats.totalSeconds)}`;
      this.item.tooltip = 'WP Launcher Productivity — Click to open dashboard';
      return;
    }

    // Say which failure it is. A single placeholder for every cause makes this
    // impossible to diagnose from the status bar.
    if (!apiKey.trim() && !secret.trim()) {
      this.item.text = '$(clock) WPL: set secret';
      this.item.tooltip = `Set wplProductivity.heartbeatSecret from Dashboard > Productivity > Cloud Settings.
Panel: ${apiUrl}`;
    } else if (result.reason === 'auth') {
      this.item.text = '$(warning) WPL: key rejected';
      this.item.tooltip = `The panel rejected these credentials (HTTP ${result.status}).
Panel: ${apiUrl}
Check wplProductivity.heartbeatSecret matches Dashboard > Productivity > Cloud Settings.`;
    } else if (result.reason === 'network') {
      this.item.text = '$(debug-disconnect) WPL: offline';
      this.item.tooltip = `Could not reach the panel at ${apiUrl}
${result.detail ?? ''}`;
    } else {
      this.item.text = '$(warning) WPL: --';
      this.item.tooltip = `Unexpected response from ${apiUrl} (HTTP ${result.status ?? '?'})
${result.detail ?? ''}`;
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }
}
