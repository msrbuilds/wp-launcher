export interface HeartbeatPayload {
  source: 'editor';
  entity: string;
  entity_type: 'file';
  project: string;
  language: string;
  editor: string;
  machine_id: string;
  branch: string;
  is_write: boolean;
  time: string;
}

export interface TodayStats {
  totalSeconds: number;
  heartbeatCount: number;
  goal: number;
}

export interface HeartbeatQueueConfig {
  getApiUrl: () => string;
  getSecret: () => string;
  getMachineId: () => string;
  editorName: string;
  debounceMs?: number;
  flushIntervalMs?: number;
  backoffIntervalMs?: number;
  maxQueueSize?: number;
  maxConsecutiveFailures?: number;
}
