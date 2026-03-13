import { z } from 'zod';

const pluginSchema = z.object({
  source: z.enum(['wordpress.org', 'url', 'local']),
  slug: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  activate: z.boolean().optional(),
});

const themeSchema = z.object({
  source: z.enum(['wordpress.org', 'url', 'local']),
  slug: z.string().optional(),
  url: z.string().optional(),
  path: z.string().optional(),
  activate: z.boolean().optional(),
});

export const productConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  wordpress: z.object({
    version: z.string().optional(),
    locale: z.string().optional(),
  }).optional(),
  plugins: z.object({
    preinstall: z.array(pluginSchema).optional(),
    remove: z.array(z.string()).optional(),
  }).optional(),
  themes: z.object({
    install: z.array(themeSchema).optional(),
    remove: z.array(z.string()).optional(),
  }).optional(),
  demo: z.object({
    default_expiration: z.string().optional(),
    max_concurrent_sites: z.number().int().positive().optional(),
    admin_user: z.string().optional(),
    admin_email: z.string().email().optional(),
    landing_page: z.string().optional(),
    rate_limit: z.object({
      max_per_ip_per_hour: z.number().int().positive().optional(),
    }).optional(),
  }).optional(),
  restrictions: z.object({
    disable_file_mods: z.boolean().optional(),
    hidden_menu_items: z.array(z.string()).optional(),
    blocked_capabilities: z.array(z.string()).optional(),
  }).optional(),
  branding: z.object({
    banner_text: z.string().optional(),
    logo_url: z.string().optional(),
    description: z.string().optional(),
    image_url: z.string().optional(),
  }).optional(),
  database: z.enum(['sqlite', 'mysql', 'mariadb']).optional(),
  docker: z.object({
    image: z.string().optional(),
  }).optional(),
}).passthrough();
