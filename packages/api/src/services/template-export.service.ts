import { getDb } from '../utils/db';
import { execWpCommands, exportAssets } from './docker.service';
import { saveProductConfig, ProductConfig } from './product.service';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

interface WpPlugin {
  name: string;
  status: string;
  update: string;
  version: string;
}

interface WpTheme {
  name: string;
  status: string;
  update: string;
  version: string;
}

// Known WordPress.org plugins/themes that don't need to be exported as local assets
const WP_ORG_INDICATORS = ['wordpress.org'];

export async function exportSiteAsTemplate(
  siteId: string,
  templateId: string,
  templateName: string,
  userId?: string,
): Promise<ProductConfig> {
  const db = getDb();
  const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(siteId) as any;
  if (!site) throw new NotFoundError('Site not found');
  if (userId && userId !== 'admin' && site.user_id !== userId) {
    throw new ForbiddenError('You do not own this site');
  }
  if (site.status !== 'running' || !site.container_id) {
    throw new ValidationError('Site must be running to export as template');
  }

  // Sanitize template ID
  const cleanId = templateId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!cleanId) throw new ValidationError('Invalid template ID');

  // Get installed plugins and themes via WP-CLI
  const wpResult = await execWpCommands(site.container_id, [
    'wp plugin list --format=json',
    'wp theme list --format=json',
    'wp option get blogname',
  ]);

  // Parse plugin list
  let plugins: WpPlugin[] = [];
  try {
    const pluginOutput = wpResult.results[0]?.output || '[]';
    // Strip any non-JSON prefix (docker stream headers)
    const jsonStart = pluginOutput.indexOf('[');
    if (jsonStart >= 0) {
      plugins = JSON.parse(pluginOutput.slice(jsonStart));
    }
  } catch { /* ignore parse errors */ }

  // Parse theme list
  let themes: WpTheme[] = [];
  try {
    const themeOutput = wpResult.results[1]?.output || '[]';
    const jsonStart = themeOutput.indexOf('[');
    if (jsonStart >= 0) {
      themes = JSON.parse(themeOutput.slice(jsonStart));
    }
  } catch { /* ignore parse errors */ }

  const siteName = wpResult.results[2]?.output?.trim() || templateName;

  // Classify plugins: wordpress.org vs local/custom
  // WordPress.org plugins have known slugs; we'll treat all as wp.org by default
  // and export only those that seem custom (not in the WP.org plugin directory pattern)
  const knownWpPlugins = new Set([
    'akismet', 'hello-dolly', 'classic-editor', 'contact-form-7', 'woocommerce',
    'elementor', 'wordpress-seo', 'wordfence', 'jetpack', 'wp-super-cache',
    'sqlite-database-integration', 'wordpress-importer',
    // MU-plugins and internal ones to skip
    'wp-launcher-restrictions', 'wp-launcher-branding', 'wp-launcher-autologin',
  ]);

  const skipPlugins = new Set(['sqlite-database-integration', 'wordpress-importer',
    'wp-launcher-restrictions', 'wp-launcher-branding', 'wp-launcher-autologin']);

  // Build preinstall list
  const preinstallPlugins: NonNullable<NonNullable<ProductConfig['plugins']>['preinstall']> = [];
  const localPluginSlugs: string[] = [];

  for (const p of plugins) {
    if (skipPlugins.has(p.name)) continue;

    const isActive = p.status === 'active' || p.status === 'active-network';

    if (knownWpPlugins.has(p.name) || p.name.match(/^[a-z0-9-]+$/)) {
      // Assume WordPress.org plugin
      preinstallPlugins.push({
        source: 'wordpress.org' as const,
        slug: p.name,
        activate: isActive,
      });
    } else {
      // Custom/local plugin — will need to export
      localPluginSlugs.push(p.name);
      preinstallPlugins.push({
        source: 'local' as const,
        path: `product-assets/${cleanId}/plugins/${p.name}.zip`,
        activate: isActive,
      });
    }
  }

  // Build theme install list
  const installThemes: NonNullable<NonNullable<ProductConfig['themes']>['install']> = [];
  const localThemeSlugs: string[] = [];
  let activeThemeSlug: string | undefined;

  const defaultThemes = new Set([
    'twentytwentyfour', 'twentytwentyfive', 'twentytwentythree', 'twentytwentytwo',
    'twentytwentyone', 'twentytwenty', 'twentynineteen',
  ]);

  for (const t of themes) {
    if (t.status === 'active') activeThemeSlug = t.name;

    if (defaultThemes.has(t.name)) continue; // Skip default themes

    if (t.name.match(/^[a-z0-9-]+$/)) {
      installThemes.push({
        source: 'wordpress.org' as const,
        slug: t.name,
        activate: t.status === 'active',
      });
    } else {
      localThemeSlugs.push(t.name);
      installThemes.push({
        source: 'local' as const,
        path: `product-assets/${cleanId}/themes/${t.name}.zip`,
        activate: t.status === 'active',
      });
    }
  }

  // Export local plugins/themes as zip files
  if (localPluginSlugs.length > 0 || localThemeSlugs.length > 0) {
    await exportAssets(site.container_id, localPluginSlugs, localThemeSlugs, cleanId);
  }

  // Determine database engine from site
  const dbEngine = site.product_id ? (() => {
    try {
      const productRow = db.prepare('SELECT config FROM products WHERE id = ?').get(site.product_id) as { config: string } | undefined;
      if (productRow) {
        const cfg = JSON.parse(productRow.config);
        return cfg.database || 'sqlite';
      }
    } catch { /* ignore */ }
    return 'sqlite';
  })() : 'sqlite';

  // Build ProductConfig
  const templateConfig: ProductConfig = {
    id: cleanId,
    name: templateName || siteName,
    database: dbEngine,
    plugins: {
      preinstall: preinstallPlugins,
    },
    themes: {
      install: installThemes,
    },
    demo: {
      default_expiration: '24h',
    },
    branding: {
      description: `Exported from site ${site.subdomain}`,
    },
  } as ProductConfig;

  // Save to templates or products directory
  const targetDir = config.isLocalMode ? config.templateConfigsDir : config.productConfigsDir;
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${cleanId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(templateConfig, null, 2));

  // Also save to DB
  saveProductConfig(templateConfig);

  return templateConfig;
}
