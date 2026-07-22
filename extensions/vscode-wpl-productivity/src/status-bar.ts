import * as vscode from 'vscode';
import { fetchTodayStats, formatDuration } from '@wpl/heartbeat-core';

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
    const stats = await fetchTodayStats(this.getApiUrl(), this.getApiKey());
    if (stats) {
      this.item.text = `$(clock) WPL: ${formatDuration(stats.totalSeconds)}`;
    } else if (!this.getApiKey()) {
      // Stats are admin-only; without a key the panel rejects the request.
      this.item.text = '$(clock) WPL: set API key';
      this.item.tooltip = 'Set wplProductivity.apiKey to your panel API key to show today’s total';
    } else {
      this.item.text = '$(clock) WPL: --';
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }
}
