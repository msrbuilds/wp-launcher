import * as vscode from 'vscode';
import * as path from 'path';
import { HeartbeatQueue, getGitBranch, normalizePath } from '@wpl/heartbeat-core';

export class HeartbeatManager {
  private queue: HeartbeatQueue;
  private disposed = false;

  constructor(
    getApiUrl: () => string,
    getSecret: () => string,
    getMachineId: () => string,
    editorName: string,
  ) {
    this.queue = new HeartbeatQueue({
      getApiUrl,
      getSecret,
      getMachineId,
      editorName,
    });
  }

  start(): void {
    this.queue.start();
  }

  onFileEvent(document: vscode.TextDocument, isWrite: boolean): void {
    if (this.disposed) return;
    if (document.uri.scheme !== 'file') return;

    const config = vscode.workspace.getConfiguration('wplProductivity');
    if (!config.get<boolean>('enabled', true)) return;

    const filePath = document.uri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const project = workspaceFolder?.name || path.basename(path.dirname(filePath));
    const relativePath = workspaceFolder
      ? path.relative(workspaceFolder.uri.fsPath, filePath)
      : path.basename(filePath);

    this.queue.enqueue({
      entity: normalizePath(relativePath),
      project,
      language: document.languageId,
      branch: getGitBranch(workspaceFolder?.uri.fsPath),
      isWrite,
    });
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.queue.dispose();
  }
}
