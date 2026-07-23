import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SiteToolsController } from '../hooks/useSiteTools';

export default function SaveTemplateDialog({ tools }: { tools: SiteToolsController }) {
  const siteId = tools.templateSiteId;

  return (
    <Dialog
      open={!!siteId}
      onOpenChange={(open) => { if (!open && !tools.templateSaving) tools.closeTemplateDialog(); }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>
            Export this site's plugins, themes, and settings as a reusable template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wpl-template-id">Template ID (slug)</Label>
            <Input
              id="wpl-template-id"
              className="rounded-lg"
              value={tools.templateId}
              onChange={(e) => tools.setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="e.g. my-starter-theme"
              disabled={tools.templateSaving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wpl-template-name">Template Name</Label>
            <Input
              id="wpl-template-name"
              className="rounded-lg"
              value={tools.templateName}
              onChange={(e) => tools.setTemplateName(e.target.value)}
              placeholder="e.g. My Starter Theme"
              disabled={tools.templateSaving}
            />
          </div>
          {tools.templateError && (
            <Alert variant="destructive">
              <AlertDescription>{tools.templateError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={tools.closeTemplateDialog} disabled={tools.templateSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => siteId && tools.exportTemplate(siteId)}
            disabled={tools.templateSaving || !tools.templateId.trim()}
          >
            {tools.templateSaving
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Exporting...</>
              : 'Save Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
