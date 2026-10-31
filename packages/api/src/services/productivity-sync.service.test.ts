import { beforeEach, expect, it, vi } from 'vitest';
import { triggerManualSync } from './productivity-sync.service';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), unsynced: vi.fn(), mark: vi.fn() }));
vi.mock('../utils/ssrf', () => ({ safeFetch: mocks.fetch }));
vi.mock('./productivity.service', () => ({
  getCloudConfig: () => ({ cloud_url: 'https://cloud.example.com', cloud_api_key: 'test-key', machine_id: 'install-1' }),
  getUnsyncedHeartbeats: mocks.unsynced, markHeartbeatsSynced: mocks.mark,
  addSyncLog: vi.fn(), setCloudConfig: vi.fn(),
}));
const heartbeat = { id: 42, source: 'editor', entity: 'main.ts', created_at: '2026-01-01 12:00:00' };
beforeEach(() => { vi.clearAllMocks(); });

it('preserves event identity after a lost response even when another event joins the retry batch', async () => {
  mocks.unsynced.mockReturnValueOnce([heartbeat]);
  mocks.fetch.mockRejectedValueOnce(new Error('response lost'));
  expect(await triggerManualSync()).toMatchObject({ status: 'error' });
  expect(mocks.mark).not.toHaveBeenCalled();

  mocks.unsynced.mockReturnValueOnce([heartbeat, { ...heartbeat, id: 43 }]).mockReturnValueOnce([]);
  mocks.fetch.mockResolvedValueOnce({ ok: true });
  expect(await triggerManualSync()).toMatchObject({ status: 'success', pushed: 2 });
  const first = JSON.parse(mocks.fetch.mock.calls[0][1].body);
  const retry = JSON.parse(mocks.fetch.mock.calls[1][1].body);
  expect(first.heartbeats[0].event_id).toBe('42');
  expect(retry.heartbeats[0]).toEqual(first.heartbeats[0]);
  expect(retry.heartbeats[1].event_id).toBe('43');
  expect(mocks.mark).toHaveBeenCalledWith([42, 43]);
});
