import { ValidationError } from '../utils/errors';

export const IMAGE_PREFIX = 'wp-launcher/';
export const DEFAULT_PHP = '8.3';
export const DEFAULT_WP = '6.9';
export const ALL_PHP_VERSIONS = ['8.5', '8.4', '8.3', '8.2', '8.1', '7.4'] as const;
export type PhpVersion = typeof ALL_PHP_VERSIONS[number];

/** WP 6.9 only ships PHP 8.x base images; 7.4 must use WP 6.1's last 7.4 tag. */
export function wpVersionForPhp(php: string): string {
  if (!ALL_PHP_VERSIONS.includes(php as PhpVersion)) {
    throw new ValidationError(`Unsupported PHP version: ${php}`);
  }
  return php === '7.4' ? '6.1' : DEFAULT_WP;
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/** Returns a safe `wp-launcher/<slug>:<tag>` image reference. */
export function sanitizeImageTag(name: string, tag = 'latest'): string {
  const s = slug(name);
  if (!s) throw new ValidationError('Image name must contain letters or numbers');
  const t = slug(tag) || 'latest';
  return `${IMAGE_PREFIX}${s}:${t}`;
}

/** The tag for a base image of a given PHP version. */
export function baseImageTag(php: string): string {
  wpVersionForPhp(php); // validates
  return `${IMAGE_PREFIX}wordpress:php${php}`;
}

export interface BuildSource {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  filename?: string;
}

export interface CustomBuildSpec {
  kind: 'custom';
  name: string;
  tag?: string;
  phpVersion: string;
  plugins: BuildSource[];
  themes: BuildSource[];
}

/**
 * Build the RUN/COPY lines that install plugins or themes into the WordPress
 * source tree. Ported from scripts/build-wp-image.sh — the upstream `wordpress`
 * image stages content at /usr/src/wordpress, which the entrypoint copies into
 * the webroot on first boot. Sources missing their required field are skipped.
 */
function installBlock(kind: 'plugins' | 'themes', sources: BuildSource[]): string {
  const dest = `/usr/src/wordpress/wp-content/${kind}/`;
  const wpType = kind === 'plugins' ? 'plugin' : 'theme';
  const lines: string[] = [];
  for (const s of sources) {
    if (s.source === 'wordpress.org' && s.slug) {
      const slug = s.slug.replace(/[^a-z0-9-]/gi, '');
      lines.push(
        `RUN curl -L "https://downloads.wordpress.org/${wpType}/${slug}.latest-stable.zip" -o /tmp/${slug}.zip \\\n` +
        `    && unzip /tmp/${slug}.zip -d ${dest} && rm /tmp/${slug}.zip`,
      );
    } else if (s.source === 'url' && s.url) {
      const file = (s.url.split('/').pop() || 'download.zip').replace(/[^a-z0-9._-]/gi, '_');
      lines.push(
        `RUN curl -L "${s.url}" -o /tmp/${file} \\\n` +
        `    && unzip /tmp/${file} -d ${dest} && rm /tmp/${file}`,
      );
    } else if (s.source === 'local' && s.filename) {
      const file = s.filename.replace(/[^a-z0-9._-]/gi, '_');
      lines.push(`COPY ${file} /tmp/${file}\nRUN unzip /tmp/${file} -d ${dest} && rm /tmp/${file}`);
    }
  }
  return lines.join('\n');
}

/** Generate a Dockerfile that layers plugins/themes onto the chosen PHP base. */
export function generateDockerfile(spec: CustomBuildSpec): string {
  const parts = [`FROM ${baseImageTag(spec.phpVersion)}`];
  const plugins = installBlock('plugins', spec.plugins);
  const themes = installBlock('themes', spec.themes);
  if (plugins) parts.push(plugins);
  if (themes) parts.push(themes);
  return parts.join('\n') + '\n';
}
