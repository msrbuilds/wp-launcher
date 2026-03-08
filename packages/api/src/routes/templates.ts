import { Router, Request, Response } from 'express';
import { listTemplates, getTemplateConfig, ProductConfig } from '../services/product.service';

const router = Router();

function sanitizeTemplate(template: ProductConfig) {
  const { docker, plugins, ...safe } = template;
  if (safe.demo) {
    const { admin_email, ...safeDemoFields } = safe.demo;
    safe.demo = safeDemoFields;
  }
  return safe;
}

// List all templates
router.get('/', (_req: Request, res: Response) => {
  try {
    const templates = listTemplates();
    res.json(templates.map(sanitizeTemplate));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific template
router.get('/:id', (req: Request, res: Response) => {
  try {
    const template = getTemplateConfig(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(sanitizeTemplate(template));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
