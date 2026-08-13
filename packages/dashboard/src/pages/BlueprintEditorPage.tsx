import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import type { PluginEntry, ThemeEntry } from '../types/product';
import PluginRepeater from '../components/PluginRepeater';
import ThemeRepeater from '../components/ThemeRepeater';
import ImageUpload from '../components/ImageUpload';
import { apiFetch } from '../utils/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DB_OPTIONS = [
  { label: 'SQLite (fastest)', value: 'sqlite' },
  { label: 'MySQL 8.4', value: 'mysql' },
  { label: 'MariaDB 11', value: 'mariadb' },
];

const EXPIRATION_OPTIONS = [
  { label: 'Never', value: 'never' },
  { label: '30 Minutes', value: '30m' },
  { label: '1 Hour', value: '1h' },
  { label: '4 Hours', value: '4h' },
  { label: '24 Hours', value: '24h' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
];

const BLOCKED_CAPABILITIES = [
  { key: 'install_plugins', label: 'Install Plugins' },
  { key: 'install_themes', label: 'Install Themes' },
  { key: 'edit_plugins', label: 'Edit Plugins' },
  { key: 'edit_themes', label: 'Edit Themes' },
  { key: 'update_core', label: 'Update Core' },
  { key: 'export', label: 'Export' },
  { key: 'import', label: 'Import' },
];

const HIDDEN_MENU_ITEMS = [
  { key: 'tools.php', label: 'Tools' },
  { key: 'options-general.php', label: 'Settings' },
  { key: 'edit.php?post_type=page', label: 'Pages' },
  { key: 'users.php', label: 'Users' },
  { key: 'plugins.php', label: 'Plugins' },
  { key: 'themes.php', label: 'Appearance' },
];

export default function BlueprintEditorPage() {
  // An :id in the route means we are editing an existing blueprint rather than
  // creating one. The same form serves both; only loading, the locked ID and
  // the wording differ.
  const { id: editingId } = useParams();
  const isEditing = !!editingId;
  const [loadingBlueprint, setLoadingBlueprint] = useState(isEditing);
  const [loadError, setLoadError] = useState('');

  // Basic info
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [database, setDatabase] = useState('sqlite');

  // Docker image. Empty means the default wp-launcher/wordpress:latest; the
  // dropdown lists images built under Settings → Images. Radix Select can't use
  // an empty-string value, so an empty selection is stored as the sentinel below.
  const DEFAULT_IMAGE = '__default__';
  const [dockerImage, setDockerImage] = useState('');
  const [availableImages, setAvailableImages] = useState<string[]>([]);

  useEffect(() => {
    apiFetch('/api/admin/images')
      .then((r) => (r.ok ? r.json() : []))
      .then((imgs: { tag: string }[]) => setAvailableImages(imgs.map((i) => i.tag)))
      .catch(() => { /* leave the list empty; the default option still works */ });
  }, []);

  // WordPress
  const [wpVersion, setWpVersion] = useState('6.9');
  const [wpLocale, setWpLocale] = useState('en_US');

  // Demo settings
  const [defaultExpiration, setDefaultExpiration] = useState('24h');
  const [maxConcurrentSites, setMaxConcurrentSites] = useState(10);
  const [adminUser, setAdminUser] = useState('demo');
  const [adminEmail, setAdminEmail] = useState('demo@example.com');
  const [landingPage, setLandingPage] = useState('');

  // Plugins
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [removePlugins, setRemovePlugins] = useState('hello, akismet');

  // Themes
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [removeThemes, setRemoveThemes] = useState('');

  // Restrictions
  const [disableFileMods, setDisableFileMods] = useState(true);
  // All seven, matching the shipped blueprints. Omitting export/import here used
  // to make a panel-created blueprint quietly weaker than _default.json.
  const [blockedCapabilities, setBlockedCapabilities] = useState<string[]>([
    'install_plugins', 'install_themes', 'edit_plugins', 'edit_themes', 'update_core',
    'export', 'import',
  ]);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);

  // Branding
  const [bannerText, setBannerText] = useState('This is a temporary demo site. It will expire in {time_remaining}.');
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [cardIconPreview, setCardIconPreview] = useState<string | null>(null);
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardIconFile, setCardIconFile] = useState<File | null>(null);
  // Already-uploaded asset URLs, carried through a save. The server only sets
  // these when a file is uploaded, so without round-tripping them an edit that
  // doesn't re-attach the images would silently blank them.
  const [cardImageUrl, setCardImageUrl] = useState('');
  const [cardIconUrl, setCardIconUrl] = useState('');

  // State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Active tab
  const [activeSection, setActiveSection] = useState<string>('basic');

  const TABS = [
    { id: 'basic', label: 'Basic Info' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'themes', label: 'Themes' },
    { id: 'demo', label: 'Site Defaults' },
    { id: 'restrictions', label: 'Restrictions' },
    { id: 'branding', label: 'Branding' },
  ];

  // ── Load an existing blueprint when editing ──
  useEffect(() => {
    if (!editingId) return;
    let active = true;
    // `full=true` returns the unsanitized blueprint — docker config, plugin
    // lists, demo admin email — which is admin-only and exactly what the form
    // needs to round-trip faithfully.
    apiFetch(`/api/blueprints/${encodeURIComponent(editingId)}?full=true`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Blueprint not found' : 'Failed to load blueprint');
        return r.json();
      })
      .then((b) => {
        if (!active) return;
        setId(b.id || '');
        setName(b.name || '');
        setCategory(b.category || '');
        setTags(Array.isArray(b.tags) ? b.tags.join(', ') : '');
        setDatabase(b.database || 'sqlite');
        setDockerImage(b.docker?.image || '');
        setWpVersion(b.wordpress?.version || '6.9');
        setWpLocale(b.wordpress?.locale || 'en_US');
        setIsPublic(!!b.public);

        setPlugins((b.plugins?.preinstall || []).map((p: any) => ({
          source: p.source,
          slug: p.slug,
          url: p.url,
          // A previously uploaded zip still lives in product-assets; keeping its
          // filename marks it attached so re-uploading stays optional.
          filename: p.path,
          activate: p.activate !== false,
        })));
        setRemovePlugins((b.plugins?.remove || []).join(', '));
        setThemes((b.themes?.install || []).map((t: any) => ({
          source: t.source,
          slug: t.slug,
          url: t.url,
          filename: t.path,
          activate: t.activate !== false,
        })));
        setRemoveThemes((b.themes?.remove || []).join(', '));

        setDefaultExpiration(b.demo?.default_expiration || '24h');
        setMaxConcurrentSites(b.demo?.max_concurrent_sites ?? 10);
        setAdminUser(b.demo?.admin_user || 'demo');
        setAdminEmail(b.demo?.admin_email || 'demo@example.com');
        setLandingPage(b.demo?.landing_page || '');

        setDisableFileMods(b.restrictions?.disable_file_mods !== false);
        setBlockedCapabilities(b.restrictions?.blocked_capabilities || []);
        setHiddenMenuItems(b.restrictions?.hidden_menu_items || []);

        setDescription(b.branding?.description || '');
        setBannerText(b.branding?.banner_text || '');
        setCardImageUrl(b.branding?.image_url || '');
        setCardIconUrl(b.branding?.logo_url || '');
        setCardImagePreview(b.branding?.image_url || null);
        setCardIconPreview(b.branding?.logo_url || null);
      })
      .catch((err) => { if (active) setLoadError(err.message || 'Failed to load blueprint'); })
      .finally(() => { if (active) setLoadingBlueprint(false); });
    return () => { active = false; };
  }, [editingId]);

  // ── Capability toggles ──
  function toggleCapability(cap: string) {
    setBlockedCapabilities(prev =>
      prev.includes(cap) ? prev.filter(c => c !== cap) : [...prev, cap]
    );
  }

  function toggleMenuItem(item: string) {
    setHiddenMenuItems(prev =>
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  }

  // ── Image helpers ──
  function handleImageFile(file: File, setFile: (f: File | null) => void, setPreview: (s: string | null) => void) {
    setFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Submit ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const blueprintId = id.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!blueprintId || !name) {
        throw new Error('Product ID and Name are required');
      }

      const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      const configObj = {
        id: blueprintId,
        name,
        ...(category && { category }),
        ...(tagsArray.length > 0 && { tags: tagsArray }),
        wordpress: { version: wpVersion, locale: wpLocale },
        plugins: {
          preinstall: plugins.map(p => {
            if (p.source === 'wordpress.org') return { source: p.source, slug: p.slug, activate: p.activate };
            if (p.source === 'url') return { source: p.source, url: p.url, activate: p.activate };
            return { source: 'local' as const, path: p.filename || p.file?.name || '', activate: p.activate };
          }),
          remove: removePlugins.split(',').map(s => s.trim()).filter(Boolean),
        },
        themes: {
          install: themes.map(t => {
            if (t.source === 'wordpress.org') return { source: t.source, slug: t.slug, activate: t.activate };
            if (t.source === 'url') return { source: t.source, url: t.url, activate: t.activate };
            return { source: 'local' as const, path: t.filename || t.file?.name || '', activate: t.activate };
          }),
          remove: removeThemes.split(',').map(s => s.trim()).filter(Boolean),
        },
        demo: {
          default_expiration: defaultExpiration,
          max_concurrent_sites: maxConcurrentSites,
          admin_user: adminUser,
          admin_email: adminEmail,
          landing_page: landingPage,
        },
        database,
        ...(dockerImage && { docker: { image: dockerImage } }),
        restrictions: {
          disable_file_mods: disableFileMods,
          hidden_menu_items: hiddenMenuItems,
          blocked_capabilities: blockedCapabilities,
        },
        public: isPublic,
        branding: {
          description,
          banner_text: bannerText,
          // Carried through so saving an edit without re-attaching the images
          // keeps them; a new upload overwrites these server-side.
          ...(cardImageUrl && { image_url: cardImageUrl }),
          ...(cardIconUrl && { logo_url: cardIconUrl }),
        },
      };

      const formData = new FormData();
      formData.append('config', JSON.stringify(configObj));

      for (const p of plugins) {
        if (p.source === 'local' && p.file) {
          formData.append('plugin_files', p.file);
        }
      }

      for (const t of themes) {
        if (t.source === 'local' && t.file) {
          formData.append('theme_files', t.file);
        }
      }

      if (cardImageFile) formData.append('card_image', cardImageFile);
      if (cardIconFile) formData.append('card_icon', cardIconFile);

      const res = await apiFetch('/api/blueprints', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create product');
      }

      setSuccess(
        isEditing
          ? `Blueprint "${name}" saved. New sites launched from it use the updated configuration.`
          : `Blueprint "${name}" created successfully! It will now appear on the launch page.`,
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {loadingBlueprint && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading blueprint...
        </div>
      )}

      {!loadingBlueprint && loadError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      <div className={cn('mb-6', (loadingBlueprint || loadError) && 'hidden')}>
        <h2 className="text-xl font-semibold text-foreground">
          {isEditing ? 'Edit Blueprint' : 'Create Blueprint'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isEditing
            ? 'Changes apply to sites launched from here on. Sites already running keep the configuration they were created with.'
            : 'Configure a blueprint for your launcher with plugins, themes, restrictions, and branding.'}
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className={cn('flex flex-col gap-6', (loadingBlueprint || loadError) && 'hidden')}
      >
        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto">
            {TABS.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="flex-none">
                {tab.label}
                {tab.id === 'plugins' && plugins.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">{plugins.length}</Badge>
                )}
                {tab.id === 'themes' && themes.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5">{themes.length}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Basic Info ── */}
          <TabsContent value="basic" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-col gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-id">Blueprint ID</Label>
                  <Input
                    id="prod-id"
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-blueprint"
                    required
                    // Editing the ID would save a *new* blueprint under it and
                    // orphan this one along with its uploaded assets.
                    disabled={isEditing}
                  />
                  <span className="text-xs text-muted-foreground">
                    {isEditing
                      ? 'The identifier cannot be changed after creation.'
                      : 'Lowercase, hyphens only. Used as identifier.'}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-name">Display Name</Label>
                  <Input
                    id="prod-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Awesome Plugin Demo"
                    required
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-db">Database Engine</Label>
                  <Select value={database} onValueChange={setDatabase}>
                    <SelectTrigger id="prod-db" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DB_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-wp-version">WordPress Version</Label>
                  <Input
                    id="prod-wp-version"
                    type="text"
                    value={wpVersion}
                    onChange={(e) => setWpVersion(e.target.value)}
                    placeholder="6.9"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-image">Docker Image</Label>
                <Select
                  value={dockerImage || DEFAULT_IMAGE}
                  onValueChange={(v) => setDockerImage(v === DEFAULT_IMAGE ? '' : v)}
                >
                  <SelectTrigger id="prod-image" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_IMAGE}>Default (wp-launcher/wordpress:latest)</SelectItem>
                    {availableImages.map((tag) => (
                      <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Base image sites launch from. Build more under Settings → Images.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-desc">Description</Label>
                <Textarea
                  id="prod-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown on the product card in the launch page"
                  rows={2}
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">Publish to demo portal</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    Offer this blueprint to visitors on the public <code className="font-mono">/demo</code> page.
                    Requires the demo portal to be enabled in Panel settings.
                  </div>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} aria-label="Publish to demo portal" />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-category">Category</Label>
                  <Input
                    id="prod-category"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Plugins, Themes, Starter"
                  />
                  <span className="text-xs text-muted-foreground">Used for filtering on the launch page.</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-tags">Tags</Label>
                  <Input
                    id="prod-tags"
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="e.g. ecommerce, starter, blog"
                  />
                  <span className="text-xs text-muted-foreground">Comma-separated. Used for search.</span>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Plugins ── */}
          <TabsContent value="plugins" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <PluginRepeater
              plugins={plugins}
              onChange={setPlugins}
              removePlugins={removePlugins}
              onRemovePluginsChange={setRemovePlugins}
            />
          </TabsContent>

          {/* ── Themes ── */}
          <TabsContent value="themes" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <ThemeRepeater
              themes={themes}
              onChange={setThemes}
              removeThemes={removeThemes}
              onRemoveThemesChange={setRemoveThemes}
            />
          </TabsContent>

          {/* ── Demo Settings ── */}
          <TabsContent value="demo" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-col gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-expiration">Default Expiration</Label>
                  <Select value={defaultExpiration} onValueChange={setDefaultExpiration}>
                    <SelectTrigger id="prod-expiration" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRATION_OPTIONS.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-max-sites">
                    Max Concurrent Sites{' '}
                    <span className="font-normal text-muted-foreground">(0 = unlimited)</span>
                  </Label>
                  <Input
                    id="prod-max-sites"
                    type="number"
                    min={0}
                    value={maxConcurrentSites}
                    onChange={(e) => setMaxConcurrentSites(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-locale">WordPress Locale</Label>
                  <Input
                    id="prod-locale"
                    type="text"
                    value={wpLocale}
                    onChange={(e) => setWpLocale(e.target.value)}
                    placeholder="en_US"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-admin-user">Admin Username</Label>
                  <Input
                    id="prod-admin-user"
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="demo"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="prod-admin-email">Admin Email</Label>
                  <Input
                    id="prod-admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="demo@example.com"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-landing">
                  Landing Page{' '}
                  <span className="font-normal text-muted-foreground">
                    (path after login, e.g. /wp-admin/plugins.php)
                  </span>
                </Label>
                <Input
                  id="prod-landing"
                  type="text"
                  value={landingPage}
                  onChange={(e) => setLandingPage(e.target.value)}
                  placeholder="Leave empty for default dashboard"
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Restrictions ── */}
          <TabsContent value="restrictions" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <Switch
                  id="prod-file-mods"
                  checked={disableFileMods}
                  onCheckedChange={setDisableFileMods}
                />
                <Label htmlFor="prod-file-mods" className="font-normal">
                  Disable File Modifications (DISALLOW_FILE_MODS)
                </Label>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Blocked Capabilities</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {BLOCKED_CAPABILITIES.map(cap => (
                    <div key={cap.key} className="flex items-center gap-3">
                      <Switch
                        id={`cap-${cap.key}`}
                        checked={blockedCapabilities.includes(cap.key)}
                        onCheckedChange={() => toggleCapability(cap.key)}
                      />
                      <Label htmlFor={`cap-${cap.key}`} className="font-normal">{cap.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Label>Hidden Admin Menu Items</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {HIDDEN_MENU_ITEMS.map(item => (
                    <div key={item.key} className="flex items-center gap-3">
                      <Switch
                        id={`menu-${item.key}`}
                        checked={hiddenMenuItems.includes(item.key)}
                        onCheckedChange={() => toggleMenuItem(item.key)}
                      />
                      <Label htmlFor={`menu-${item.key}`} className="font-normal">{item.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Branding ── */}
          <TabsContent value="branding" className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="prod-banner">
                  Banner Text{' '}
                  <span className="font-normal text-muted-foreground">
                    ({'{time_remaining}'} for countdown)
                  </span>
                </Label>
                <Input
                  id="prod-banner"
                  type="text"
                  value={bannerText}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="This is a temporary demo site. It will expire in {time_remaining}."
                />
              </div>

              <div className="flex flex-col gap-5 md:flex-row md:items-start">
                <ImageUpload
                  label="Card Image"
                  hint="3:2 ratio recommended"
                  preview={cardImagePreview}
                  onFileSelect={(file) => handleImageFile(file, setCardImageFile, setCardImagePreview)}
                  onClear={() => { setCardImageFile(null); setCardImagePreview(null); }}
                />
                <ImageUpload
                  label="Card Icon"
                  hint="Square, 160px"
                  preview={cardIconPreview}
                  onFileSelect={(file) => handleImageFile(file, setCardIconFile, setCardIconPreview)}
                  onClear={() => { setCardIconFile(null); setCardIconPreview(null); }}
                  className="aspect-square max-w-40"
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          size="lg"
          className="self-start"
          // A failed load must not become an accidental create: without this the
          // empty form would happily save a brand-new blueprint.
          disabled={submitting || !id || !name || !!loadError}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              {isEditing ? 'Saving...' : 'Creating Blueprint...'}
            </>
          ) : (
            <>
              <Save />
              {isEditing ? 'Save Changes' : 'Create Blueprint'}
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
