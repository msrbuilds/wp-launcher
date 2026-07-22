import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';
import type { PluginEntry, ThemeEntry } from '../types/product';
import PluginRepeater from '../components/PluginRepeater';
import ThemeRepeater from '../components/ThemeRepeater';
import ImageUpload from '../components/ImageUpload';
import { apiFetch } from '../utils/api';
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
  // Basic info
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [database, setDatabase] = useState('sqlite');

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
  const [blockedCapabilities, setBlockedCapabilities] = useState<string[]>([
    'install_plugins', 'install_themes', 'edit_plugins', 'edit_themes', 'update_core',
  ]);
  const [hiddenMenuItems, setHiddenMenuItems] = useState<string[]>([]);

  // Branding
  const [bannerText, setBannerText] = useState('This is a temporary demo site. It will expire in {time_remaining}.');
  const [cardImagePreview, setCardImagePreview] = useState<string | null>(null);
  const [cardIconPreview, setCardIconPreview] = useState<string | null>(null);
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [cardIconFile, setCardIconFile] = useState<File | null>(null);

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
        restrictions: {
          disable_file_mods: disableFileMods,
          hidden_menu_items: hiddenMenuItems,
          blocked_capabilities: blockedCapabilities,
        },
        branding: {
          description,
          banner_text: bannerText,
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

      setSuccess(`Product "${name}" created successfully! It will now appear on the launch page.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-foreground">Create Product</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure a product for your demo site launcher with plugins, themes, restrictions, and branding.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
                  <Label htmlFor="prod-id">Product ID</Label>
                  <Input
                    id="prod-id"
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="my-product"
                    required
                  />
                  <span className="text-xs text-muted-foreground">Lowercase, hyphens only. Used as identifier.</span>
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
                <Label htmlFor="prod-desc">Description</Label>
                <Textarea
                  id="prod-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Shown on the product card in the launch page"
                  rows={2}
                />
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
          disabled={submitting || !id || !name}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" />
              Creating Product...
            </>
          ) : (
            <>
              <Save />
              Create Product
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
