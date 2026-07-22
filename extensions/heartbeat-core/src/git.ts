import * as cp from 'child_process';

export function getGitBranch(workspacePath?: string): string {
  if (!workspacePath) return '';
  try {
    const result = cp.execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workspacePath,
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.toString().trim();
  } catch {
    return '';
  }
}
