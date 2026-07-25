/**
 * Where productivity heartbeats end up. Local SQLite is always written — it backs
 * the panel dashboard and buffers for cloud sync — so this only decides whether
 * rows are additionally pushed to a linked cloud account.
 */
export type TrackingDestination = 'auto' | 'local' | 'cloud';

export const DESTINATIONS: readonly TrackingDestination[] = ['auto', 'local', 'cloud'];
export const DEFAULT_DESTINATION: TrackingDestination = 'auto';

/** The settings key holding the operator's choice. */
export const DESTINATION_SETTING_KEY = 'productivity.destination';

export function parseDestination(value: string | null | undefined): TrackingDestination {
  const v = (value || '').trim().toLowerCase();
  return (DESTINATIONS as readonly string[]).includes(v) ? (v as TrackingDestination) : DEFAULT_DESTINATION;
}

/**
 * `auto` mirrors the deployment: a public install feeds the cloud, a developer
 * machine keeps its data to itself. `local` opts a public install out (e.g. a
 * client-facing box), and `cloud` opts a local machine in. Syncing always
 * requires a linked account regardless of choice.
 */
export function resolveSyncEnabled(input: {
  destination: TrackingDestination;
  cloudLinked: boolean;
  isLocal: boolean;
}): boolean {
  if (!input.cloudLinked) return false;
  switch (input.destination) {
    case 'local': return false;
    case 'cloud': return true;
    case 'auto': return !input.isLocal;
  }
}
