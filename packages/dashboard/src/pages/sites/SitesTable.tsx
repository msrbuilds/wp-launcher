import { Fragment } from 'react';
import { Globe, Loader2, LogIn, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { FeatureFlags } from '../../context/SettingsContext';
import { SiteControllers } from './controllers';
import PanelShell from './PanelShell';
import SiteToolsMenu from './SiteToolsMenu';
import PhpConfigPanel from './panels/PhpConfigPanel';
import SnapshotsPanel, { SnapshotsPanelHeaderButton } from './panels/SnapshotsPanel';
import HealthPanel from './panels/HealthPanel';
import SharePanel from './panels/SharePanel';
import TunnelPanel from './panels/TunnelPanel';
import { PanelKind, Site, statusDotClass } from './types';

interface Props {
  sites: Site[];
  features: FeatureFlags;
  controllers: SiteControllers;
  isSiteReady: (site: Site) => boolean;
  expandedSite: string | null;
  expandedPanel: PanelKind | null;
  onOpenPanel: (siteId: string, panel: PanelKind) => void;
  onClosePanel: () => void;
  actionsOpen: string | null;
  onActionsOpenChange: (siteId: string | null) => void;
  onDelete: (siteId: string) => void;
}

export default function SitesTable({
  sites, features, controllers, isSiteReady, expandedSite, expandedPanel,
  onOpenPanel, onClosePanel, actionsOpen, onActionsOpenChange, onDelete,
}: Props) {
  const { php, snapshots, health, shares, tunnel } = controllers;

  const hasTools = features.cloning || features.templates || features.snapshots
    || features.phpConfig || features.healthMonitoring || features.sitePassword
    || features.exportZip || features.adminer || features.publicSharing;

  const closeButton = (
    <Button variant="secondary" size="xs" onClick={onClosePanel}>Close</Button>
  );

  function panelFor(site: Site) {
    if (expandedSite !== site.id || !expandedPanel) return null;

    if (features.snapshots && expandedPanel === 'snapshots') {
      return (
        <PanelShell
          title="Snapshots"
          actions={
            <>
              <SnapshotsPanelHeaderButton siteId={site.id} snapshots={snapshots} label="Take Snapshot" />
              {closeButton}
            </>
          }
        >
          <SnapshotsPanel siteId={site.id} snapshots={snapshots} />
        </PanelShell>
      );
    }

    if (features.phpConfig && expandedPanel === 'php') {
      return (
        <PanelShell
          title="PHP Settings"
          subtitle="Changes apply instantly (Apache graceful reload)"
          actions={closeButton}
        >
          <PhpConfigPanel siteId={site.id} php={php} />
        </PanelShell>
      );
    }

    if (features.healthMonitoring && expandedPanel === 'health') {
      return (
        <PanelShell
          title="Resource Usage"
          actions={
            <>
              <Button
                variant="secondary"
                size="xs"
                onClick={() => health.load(site.id)}
                disabled={health.loadingId === site.id}
              >
                {health.loadingId === site.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Refresh'}
              </Button>
              {closeButton}
            </>
          }
        >
          <HealthPanel siteId={site.id} health={health} />
        </PanelShell>
      );
    }

    if (features.collaborativeSites && expandedPanel === 'share') {
      return (
        <PanelShell title="Share Site" actions={closeButton}>
          <SharePanel siteId={site.id} shares={shares} />
        </PanelShell>
      );
    }

    if (features.publicSharing && expandedPanel === 'tunnel') {
      return (
        <PanelShell title="Share Publicly" actions={closeButton}>
          <TunnelPanel siteId={site.id} tunnel={tunnel} />
        </PanelShell>
      );
    }

    return null;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card p-2 text-card-foreground">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            const panel = panelFor(site);
            return (
              <Fragment key={site.id}>
                <TableRow>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full', statusDotClass(site.status))} />
                      <span className="text-xs capitalize text-muted-foreground">{site.status}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={site.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      {site.subdomain}
                    </a>
                  </TableCell>
                  <TableCell><span className="text-sm text-muted-foreground">{site.blueprintId}</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(site.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    {!isSiteReady(site) && site.status === 'running' ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Setting up...
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="xs"
                          title="Login to WP Admin"
                          onClick={() => controllers.tools.autoLogin(site.id, site.adminUrl)}
                        >
                          <LogIn /> Login
                        </Button>
                        <Button asChild variant="secondary" size="xs" title="Visit site">
                          <a href={site.url} target="_blank" rel="noopener noreferrer">
                            <Globe /> Visit
                          </a>
                        </Button>
                        {(hasTools || site.status === 'running' || site.hostPath) && (
                          <SiteToolsMenu
                            site={site}
                            features={features}
                            controllers={controllers}
                            layout="table"
                            open={actionsOpen === site.id}
                            onOpenChange={(open) => onActionsOpenChange(open ? site.id : null)}
                            onOpenPanel={(p) => onOpenPanel(site.id, p)}
                            onDelete={() => onDelete(site.id)}
                          />
                        )}
                        <Button
                          variant="destructive"
                          size="icon-xs"
                          title="Delete site"
                          onClick={() => onDelete(site.id)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>

                {panel && (
                  <TableRow>
                    <TableCell colSpan={5} className="bg-background p-3">{panel}</TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}

          {sites.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No sites match your filters
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
