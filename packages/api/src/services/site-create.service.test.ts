import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createSiteTestDb } from '../test-helpers/sites';
import { __setDbForTesting } from '../utils/db';
import { createSite } from './site.service';
import { setSetting } from './settings.service';

const mocks = vi.hoisted(() => ({ create: vi.fn(), images: vi.fn(), blueprint: vi.fn() }));
vi.mock('./docker.service', () => ({ createSiteContainer: mocks.create, listWplImages: mocks.images }));
vi.mock('./blueprint.service', () => ({ getBlueprint: mocks.blueprint }));
vi.mock('./webhook.service', () => ({ fireWebhookEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./productivity.service', () => ({ getCloudConfig: () => ({}) }));

let db: ReturnType<typeof createSiteTestDb>;
const request = { blueprintId: 'demo', userId: 'alice', userRole: 'member', subdomain: 'test-site' };

beforeEach(() => {
  db = createSiteTestDb();
  __setDbForTesting(db);
  mocks.create.mockReset().mockResolvedValue('container-id');
  mocks.images.mockReset().mockResolvedValue([{ tag: 'wp-launcher/wordpress:latest' }]);
  mocks.blueprint.mockReset().mockReturnValue({ id: 'demo', name: 'Demo', docker: { image: 'wp-launcher/wordpress:latest' } });
});
afterEach(() => { __setDbForTesting(null); db.close(); });

describe('site launch reservations', () => {
  it('does not reserve a subdomain or store credentials when the image is missing; retry succeeds', async () => {
    mocks.images.mockResolvedValueOnce([]);
    await expect(createSite(request)).rejects.toMatchObject({ details: { code: 'IMAGE_NOT_BUILT' } });
    expect(db.prepare('SELECT * FROM sites').all()).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
    const site = await createSite(request);
    expect(site.status).toBe('running');
    expect(site.admin_password).toBeNull();
    expect(site.oneTimePassword).toBeTruthy();
  });

  it.each(['user', 'total', 'blueprint'])('counts in-progress launches against the %s quota', async (quota) => {
    if (quota === 'user') setSetting('panel.quota.member', '1');
    if (quota === 'total') setSetting('panel.quota.total', '1');
    if (quota === 'blueprint') mocks.blueprint.mockReturnValue({ id: 'demo', name: 'Demo', demo: { max_concurrent_sites: 1 } });
    let finish!: (id: string) => void;
    mocks.create.mockImplementationOnce(() => new Promise<string>((resolve) => { finish = resolve; }));
    const first = createSite(request);
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    try {
      await expect(createSite({ ...request, subdomain: 'second-site', userId: quota === 'user' ? 'alice' : 'bob' }))
        .rejects.toMatchObject({ statusCode: 409 });
      expect(mocks.create).toHaveBeenCalledOnce();
    } finally { finish('container-id'); await first; }
  });

  it('clears credentials and frees the subdomain after a provisioner failure', async () => {
    mocks.create.mockRejectedValueOnce(new Error('Docker failed'));
    await expect(createSite(request)).rejects.toThrow('Docker failed');
    expect(db.prepare('SELECT status, admin_password, subdomain FROM sites').get()).toMatchObject({
      status: 'error', admin_password: null, subdomain: expect.stringContaining('--error-'),
    });
    await expect(createSite(request)).resolves.toMatchObject({ status: 'running', subdomain: 'test-site' });
  });

  it('still lets the provisioner resolve an image when image inventory is unavailable', async () => {
    mocks.images.mockRejectedValueOnce(new Error('inventory unavailable'));
    await expect(createSite(request)).resolves.toMatchObject({ status: 'running' });
  });
});
