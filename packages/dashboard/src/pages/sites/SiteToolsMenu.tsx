import {
  BarChart3,
  Bookmark,
  Camera,
  Clock,
  Copy,
  Database,
  Download,
  FolderOpen,
  Globe,
  Loader2,
  Lock,
  Settings,
  Share2,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FeatureFlags } from '../../context/SettingsContext';
import { SiteControllers } from './controllers';
import { EXTEND_OPTIONS, PanelKind, Site } from './types';

interface Props {
  site: Site;
  features: FeatureFlags;
  controllers: SiteControllers;
  layout: 'table' | 'card';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPanel: (panel: PanelKind) => void;
  onDelete: () => void;
}

/**
 * Turn a host path into a file:// URL that a browser can act on. Handles both
 * Windows (`E:\a\b` → `file:///E:/a/b`) and POSIX (`/a/b` → `file:///a/b`).
 */
function toFileUrl(hostPath: string): string {
  const isWindows = /^[a-zA-Z]:[\\/]/.test(hostPath);
  const slashed = hostPath.replace(/\\/g, '/');
  const withRoot = isWindows ? `/${slashed}` : (slashed.startsWith('/') ? slashed : `/${slashed}`);
  // encodeURI keeps the slashes and colon but escapes spaces etc.
  return `file://${encodeURI(withRoot)}`;
}

export default function SiteToolsMenu({
  site, features, controllers, layout, open, onOpenChange, onOpenPanel, onDelete,
}: Props) {
  const { php, snapshots, domains, health, shares, tunnel, tools } = controllers;
  const running = site.status === 'running';
  const cloning = tools.cloningId === site.id;
  const exporting = tools.exportingId === site.id;
  const isTable = layout === 'table';

  function copyCliCommand() {
    navigator.clipboard
      .writeText(`docker exec wp-site-${site.subdomain} wp --allow-root `)
      .catch(() => { /* clipboard may be unavailable over plain http */ });
  }

  // Browsers won't launch the OS file manager for us, and the API is a Linux
  // container so it can't either. Best effort: copy the path (always works) and
  // try to open a file:// view (works only where the browser allows it).
  function openFilesFolder() {
    if (!site.hostPath) return;
    navigator.clipboard.writeText(site.hostPath).catch(() => {});
    window.open(toFileUrl(site.hostPath), '_blank', 'noopener');
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isTable ? 'secondary' : 'default'}
          size="xs"
          disabled={isTable && cloning}
          title="Tools"
        >
          {isTable && cloning
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Cloning...</>
            : <><Wrench /> Tools</>}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {running && (
          <DropdownMenuItem onSelect={copyCliCommand}>
            <Terminal /> Copy WP-CLI command
          </DropdownMenuItem>
        )}
        {site.hostPath && (
          <DropdownMenuItem onSelect={openFilesFolder} title={site.hostPath}>
            <FolderOpen /> Open files folder
          </DropdownMenuItem>
        )}
        {(running || site.hostPath) && <DropdownMenuSeparator />}

        {features.cloning && (
          <DropdownMenuItem onSelect={() => tools.clone(site.id)} disabled={cloning}>
            {cloning ? <Loader2 className="animate-spin" /> : <Copy />}
            {isTable ? 'Clone' : 'Clone Site'}
          </DropdownMenuItem>
        )}

        {!isTable && features.customDomains && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('domain');
              if (!domains.status[site.id]) domains.load(site.id);
            }}
          >
            <Globe /> Custom Domain
          </DropdownMenuItem>
        )}

        {features.templates && (
          <DropdownMenuItem onSelect={() => tools.openTemplateDialog(site.id)}>
            <Bookmark /> Save as Template
          </DropdownMenuItem>
        )}

        {features.snapshots && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('snapshots');
              if (!snapshots.bySite[site.id]) snapshots.load(site.id);
            }}
          >
            <Camera /> Snapshots
          </DropdownMenuItem>
        )}

        {features.phpConfig && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('php');
              if (!php.configs[site.id]) php.load(site.id);
            }}
          >
            <Settings /> {isTable ? 'PHP Config' : 'PHP Settings'}
          </DropdownMenuItem>
        )}

        {!isTable && features.collaborativeSites && running && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('share');
              shares.load(site.id);
            }}
          >
            <Share2 /> Share Site
          </DropdownMenuItem>
        )}

        {features.healthMonitoring && (isTable || running) && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('health');
              health.load(site.id);
            }}
          >
            <BarChart3 /> {isTable ? 'Stats' : 'Resource Stats'}
          </DropdownMenuItem>
        )}

        {features.sitePassword && (isTable || running) && (
          <DropdownMenuItem onSelect={() => tools.openPasswordDialog(site.id)}>
            <Lock /> {isTable ? 'Password' : 'Password Protection'}
          </DropdownMenuItem>
        )}

        {features.exportZip && (isTable || running) && (
          <DropdownMenuItem onSelect={() => tools.exportZip(site.id)} disabled={exporting}>
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {isTable ? 'Export ZIP' : 'Export as ZIP'}
          </DropdownMenuItem>
        )}

        {features.adminer && (isTable || running) && (
          <DropdownMenuItem onSelect={() => tools.openAdminer(site)}>
            <Database /> Database
          </DropdownMenuItem>
        )}

        {features.publicSharing && (isTable || running) && (
          <DropdownMenuItem
            onSelect={() => {
              onOpenPanel('tunnel');
              tunnel.load(site.id);
            }}
          >
            <Share2 /> Share Publicly
          </DropdownMenuItem>
        )}

        {!isTable && features.siteExtend && running && (
          <>
            <DropdownMenuLabel className="text-xs text-muted-foreground">Extend by</DropdownMenuLabel>
            {EXTEND_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.value} onSelect={() => tools.extend(site.id, opt.value)}>
                <Clock /> + {opt.label}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {!isTable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 /> Delete Site
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
