import { Plus, X } from 'lucide-react';
import type { PluginEntry } from '../types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PluginRepeaterProps {
  plugins: PluginEntry[];
  onChange: (plugins: PluginEntry[]) => void;
  removePlugins: string;
  onRemovePluginsChange: (value: string) => void;
}

export default function PluginRepeater({ plugins, onChange, removePlugins, onRemovePluginsChange }: PluginRepeaterProps) {
  function addPlugin() {
    onChange([...plugins, { source: 'wordpress.org', slug: '', activate: true }]);
  }

  function updatePlugin(index: number, updates: Partial<PluginEntry>) {
    const updated = [...plugins];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  }

  function removePlugin(index: number) {
    onChange(plugins.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {plugins.map((plugin, i) => (
        <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex flex-col gap-2 md:w-48">
              <Label htmlFor={`plugin-source-${i}`}>Source</Label>
              <Select
                value={plugin.source}
                onValueChange={(value) => updatePlugin(i, { source: value as any })}
              >
                <SelectTrigger id={`plugin-source-${i}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wordpress.org">WordPress.org</SelectItem>
                  <SelectItem value="url">URL</SelectItem>
                  <SelectItem value="local">Upload Zip</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-1 flex-col gap-2">
              {plugin.source === 'wordpress.org' && (
                <>
                  <Label htmlFor={`plugin-slug-${i}`}>Plugin Slug</Label>
                  <Input
                    id={`plugin-slug-${i}`}
                    type="text"
                    value={plugin.slug || ''}
                    onChange={(e) => updatePlugin(i, { slug: e.target.value })}
                    placeholder="e.g. woocommerce"
                  />
                </>
              )}
              {plugin.source === 'url' && (
                <>
                  <Label htmlFor={`plugin-url-${i}`}>Download URL</Label>
                  <Input
                    id={`plugin-url-${i}`}
                    type="url"
                    value={plugin.url || ''}
                    onChange={(e) => updatePlugin(i, { url: e.target.value })}
                    placeholder="https://example.com/plugin.zip"
                  />
                </>
              )}
              {plugin.source === 'local' && (
                <>
                  <Label htmlFor={`plugin-file-${i}`}>Zip File</Label>
                  <Input
                    id={`plugin-file-${i}`}
                    type="file"
                    accept=".zip"
                    className="py-1.5"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      updatePlugin(i, { file, filename: file?.name });
                    }}
                  />
                  {plugin.filename && (
                    <span className="text-xs text-muted-foreground">{plugin.filename}</span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 md:pb-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`plugin-activate-${i}`}
                  checked={plugin.activate}
                  onCheckedChange={(checked) => updatePlugin(i, { activate: checked })}
                />
                <Label htmlFor={`plugin-activate-${i}`} className="text-sm font-normal">
                  Activate
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removePlugin(i)}
                title="Remove"
              >
                <X />
                <span className="sr-only">Remove plugin</span>
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addPlugin}>
        <Plus />
        Add Plugin
      </Button>

      <div className="flex flex-col gap-2">
        <Label htmlFor="plugin-remove-defaults">
          Remove Default Plugins{' '}
          <span className="font-normal text-muted-foreground">(comma-separated slugs)</span>
        </Label>
        <Input
          id="plugin-remove-defaults"
          type="text"
          value={removePlugins}
          onChange={(e) => onRemovePluginsChange(e.target.value)}
          placeholder="hello, akismet"
        />
      </div>
    </div>
  );
}
