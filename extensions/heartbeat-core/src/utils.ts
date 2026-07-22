/**
 * Format seconds into human-readable duration string.
 * Examples: "0m", "45m", "1h 30m", "8h 0m"
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Normalize a file path to use forward slashes (for consistent entity values across OS).
 */
export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}
