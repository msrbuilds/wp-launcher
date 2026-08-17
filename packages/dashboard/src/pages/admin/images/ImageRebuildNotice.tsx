import { useState } from 'react';
import { Hammer, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext';
import { BuildLogPanel } from './BuildLogPanel';

/**
 * The machine-readable half of a failed launch. The API sends this alongside
 * the prose so the panel can offer the fix instead of asking the operator to
 * translate an error message into a build request.
 */
export interface ImageNotBuiltDetails {
  code?: string;
  image?: string;
  rebuildable?: boolean;
}

/** Whether a failed launch was caused by a missing image we can act on. */
export function isImageNotBuilt(details: unknown): details is ImageNotBuiltDetails {
  return !!details && (details as ImageNotBuiltDetails).code === 'IMAGE_NOT_BUILT';
}

/**
 * Offers a one-click rebuild of the missing image, then streams the build log.
 *
 * Three outcomes, deliberately distinct — a button that cannot work is worse
 * than none, because it looks like the fix:
 *   - a base image, admin: rebuild here
 *   - a base image, member: name the tag so they can ask someone who can
 *   - a custom product image: say why it needs the script, since a base rebuild
 *     under that name would silently discard its plugins and themes
 */
export default function ImageRebuildNotice({ details }: { details: ImageNotBuiltDetails }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState('');

  const tag = details.image || 'the image';

  async function rebuild() {
    setStarting(true);
    setFailure('');
    try {
      const res = await apiFetch('/api/admin/images/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: details.image }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFailure(data?.error || `Could not start the build (HTTP ${res.status})`);
        return;
      }
      setJobId(data.jobId);
    } catch {
      setFailure('Could not reach the server to start the build');
    } finally {
      setStarting(false);
    }
  }

  if (jobId) {
    return (
      <div className="mt-3">
        <p className="mb-2 text-sm">
          Rebuilding <code className="font-mono">{tag}</code>. This takes a few minutes; you can
          launch again once it succeeds.
        </p>
        <BuildLogPanel jobId={jobId} />
      </div>
    );
  }

  if (!details.rebuildable) {
    return (
      <p className="mt-2 text-sm">
        <code className="font-mono">{tag}</code> is a custom image with plugins and themes baked
        in, so it cannot be rebuilt from here — a base rebuild would replace it with a plain
        WordPress image. Rebuild it on the host with{' '}
        <code className="font-mono">bash scripts/build-wp-image.sh</code>.
      </p>
    );
  }

  if (!isAdmin) {
    return (
      <p className="mt-2 text-sm">
        Ask an administrator to rebuild <code className="font-mono">{tag}</code> under
        Settings → Images.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <Button size="sm" onClick={rebuild} disabled={starting}>
        {starting
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting build...</>
          : <><Hammer className="h-4 w-4" /> Rebuild {tag}</>}
      </Button>
      {failure && <p className="mt-2 text-sm">{failure}</p>}
    </div>
  );
}
