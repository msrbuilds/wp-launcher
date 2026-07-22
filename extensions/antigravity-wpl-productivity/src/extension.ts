import * as vscode from 'vscode';
import { HeartbeatManager } from './heartbeat';
import { StatusBarManager } from './status-bar';

const EDITOR_NAME = 'antigravity';

let heartbeatManager: HeartbeatManager | undefined;
let statusBarManager: StatusBarManager | undefined;

function getApiKey(): string {
  return vscode.workspace.getConfiguration('wplProductivity').get<string>('apiKey', '');
}

function getApiUrl(): string {
  return vscode.workspace.getConfiguration('wplProductivity').get<string>('apiUrl', 'http://localhost:3737');
}

function getSecret(): string {
  return vscode.workspace.getConfiguration('wplProductivity').get<string>('heartbeatSecret', '');
}

function getMachineId(): string {
  return vscode.env.machineId;
}

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('wplProductivity');
  if (!config.get<boolean>('enabled', true)) return;

  heartbeatManager = new HeartbeatManager(getApiUrl, getSecret, getMachineId, EDITOR_NAME);
  statusBarManager = new StatusBarManager(getApiUrl, getApiKey, getSecret);

  heartbeatManager.start();
  statusBarManager.start();

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      heartbeatManager?.onFileEvent(e.document, false);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      heartbeatManager?.onFileEvent(doc, true);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        heartbeatManager?.onFileEvent(editor.document, false);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('wplProductivity.showStats', () => {
      const apiUrl = getApiUrl();
      const url = new URL(apiUrl);
      const dashboardUrl = `${url.protocol}//${url.hostname}/productivity`;
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
    }),
    vscode.commands.registerCommand('wplProductivity.toggleTracking', () => {
      const cfg = vscode.workspace.getConfiguration('wplProductivity');
      const current = cfg.get<boolean>('enabled', true);
      cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `WP Launcher Productivity: Tracking ${!current ? 'enabled' : 'disabled'}`
      );
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('wplProductivity.enabled')) {
        const enabled = vscode.workspace.getConfiguration('wplProductivity').get<boolean>('enabled', true);
        if (!enabled) {
          heartbeatManager?.dispose();
          statusBarManager?.dispose();
          heartbeatManager = undefined;
          statusBarManager = undefined;
        } else if (!heartbeatManager) {
          heartbeatManager = new HeartbeatManager(getApiUrl, getSecret, getMachineId, EDITOR_NAME);
          statusBarManager = new StatusBarManager(getApiUrl, getApiKey, getSecret);
          heartbeatManager.start();
          statusBarManager.start();
        }
      }
    }),
  );
}

export function deactivate(): void {
  heartbeatManager?.dispose();
  statusBarManager?.dispose();
}
