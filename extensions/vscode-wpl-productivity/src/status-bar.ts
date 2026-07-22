import * as vscode from 'vscode';
import { fetchTodayStatsResult, formatDuration } from '@wpl/heartbeat-core';

const REFRESH_INTERVAL_MS = 60 * 1000; // 1 minute

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private timer: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(private getApiUrl: () => string, private getApiKey: () => string = () => '') {
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
    const result = await fetchTodayStatsResult(apiUrl, apiKey);

    if (result.ok) {
      this.item.text = `$(clock) WPL: ${formatDuration(result.stats.totalSeconds)}`;
      this.item.tooltip = 'WP Launcher Productivity — Click to open dashboard';
      return;
    }

    // Say which failure it is. A single placeholder for every cause makes this
    // impossible to diagnose from the status bar.
    if (!apiKey.trim()) {
      this.item.text = '$(clock) WPL: set API key';
      this.item.tooltip = `Set wplProductivity.apiKey to your panel's API_KEY.
Panel: ${apiUrl}`;
    } else if (result.reason === 'auth') {
      this.item.text = '$(warning) WPL: key rejected';
      this.item.tooltip = `The panel rejected this API key (HTTP ${result.status}).
Panel: ${apiUrl}
Check wplProductivity.apiKey matches API_KEY in the panel's .env.`;
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
