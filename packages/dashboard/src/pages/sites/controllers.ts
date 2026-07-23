import { PhpController } from './hooks/usePhpConfig';
import { SnapshotsController } from './hooks/useSnapshots';
import { DomainsController } from './hooks/useDomains';
import { HealthController } from './hooks/useHealth';
import { SharesController } from './hooks/useShares';
import { TunnelController } from './hooks/useTunnel';
import { SiteToolsController } from './hooks/useSiteTools';

/** Every feature controller the sites views need, bundled into one prop. */
export interface SiteControllers {
  php: PhpController;
  snapshots: SnapshotsController;
  domains: DomainsController;
  health: HealthController;
  shares: SharesController;
  tunnel: TunnelController;
  tools: SiteToolsController;
}
