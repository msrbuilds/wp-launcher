import { Plus, X } from 'lucide-react';
import type { ThemeEntry } from '../types/product';
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

interface ThemeRepeaterProps {
  themes: ThemeEntry[];
  onChange: (themes: ThemeEntry[]) => void;
  removeThemes: string;
  onRemoveThemesChange: (value: string) => void;
}

export default function ThemeRepeater({ themes, onChange, removeThemes, onRemoveThemesChange }: ThemeRepeaterProps) {
  function addTheme() {
    onChange([...themes, { source: 'wordpress.org', slug: '', activate: false }]);
  }

  function updateTheme(index: number, updates: Partial<ThemeEntry>) {
    const updated = [...themes];
    updated[index] = { ...updated[index], ...updates };
    onChange(updated);
  }

  function removeTheme(index: number) {
    onChange(themes.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-4">
      {themes.map((theme, i) => (
        <div key={i} className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex flex-col gap-2 md:w-48">
              <Label htmlFor={`theme-source-${i}`}>Source</Label>
              <Select
                value={theme.source}
                onValueChange={(value) => updateTheme(i, { source: value as any })}
              >
                <SelectTrigger id={`theme-source-${i}`} className="w-full">
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
              {theme.source === 'wordpress.org' && (
                <>
                  <Label htmlFor={`theme-slug-${i}`}>Theme Slug</Label>
                  <Input
                    id={`theme-slug-${i}`}
                    type="text"
                    value={theme.slug || ''}
                    onChange={(e) => updateTheme(i, { slug: e.target.value })}
                    placeholder="e.g. flavor"
                  />
                </>
              )}
              {theme.source === 'url' && (
                <>
                  <Label htmlFor={`theme-url-${i}`}>Download URL</Label>
                  <Input
                    id={`theme-url-${i}`}
                    type="url"
                    value={theme.url || ''}
                    onChange={(e) => updateTheme(i, { url: e.target.value })}
                    placeholder="https://example.com/theme.zip"
                  />
                </>
              )}
              {theme.source === 'local' && (
                <>
                  <Label htmlFor={`theme-file-${i}`}>Zip File</Label>
                  <Input
                    id={`theme-file-${i}`}
                    type="file"
                    accept=".zip"
                    className="py-1.5"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null;
                      updateTheme(i, { file, filename: file?.name });
                    }}
                  />
                  {theme.filename && (
                    <span className="text-xs text-muted-foreground">{theme.filename}</span>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 md:pb-2">
              <div className="flex items-center gap-2">
                <Switch
                  id={`theme-activate-${i}`}
                  checked={theme.activate}
                  onCheckedChange={(checked) => updateTheme(i, { activate: checked })}
                />
                <Label htmlFor={`theme-activate-${i}`} className="text-sm font-normal">
                  Activate
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeTheme(i)}
                title="Remove"
              >
                <X />
                <span className="sr-only">Remove theme</span>
              </Button>
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" size="sm" className="self-start" onClick={addTheme}>
        <Plus />
        Add Theme
      </Button>

      <div className="flex flex-col gap-2">
        <Label htmlFor="theme-remove-defaults">
          Remove Default Themes{' '}
          <span className="font-normal text-muted-foreground">(comma-separated slugs)</span>
        </Label>
        <Input
          id="theme-remove-defaults"
          type="text"
          value={removeThemes}
          onChange={(e) => onRemoveThemesChange(e.target.value)}
          placeholder="twentytwentyfive"
        />
      </div>
    </div>
  );
}
