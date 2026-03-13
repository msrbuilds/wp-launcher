export interface PluginEntry {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  file?: File | null;
  filename?: string;
  activate: boolean;
}

export interface ThemeEntry {
  source: 'wordpress.org' | 'url' | 'local';
  slug?: string;
  url?: string;
  file?: File | null;
  filename?: string;
  activate: boolean;
}
