import { Router, Request, Response } from 'express';
import { listProducts, getProductConfig, saveProductConfig, ProductConfig } from '../services/product.service';

const router = Router();

function sanitizeProduct(product: ProductConfig) {
  const { docker, plugins, ...safe } = product;
  if (safe.demo) {
    const { admin_email, ...safeDemoFields } = safe.demo;
    safe.demo = safeDemoFields;
  }
  return safe;
}

// List all products
router.get('/', (_req: Request, res: Response) => {
  try {
    const products = listProducts();
    res.json(products.map(sanitizeProduct));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific product config
router.get('/:id', (req: Request, res: Response) => {
  try {
    const product = getProductConfig(req.params.id);
    res.json(sanitizeProduct(product));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update a product config
router.put('/:id', (req: Request, res: Response) => {
  try {
    const productConfig = { ...req.body, id: req.params.id };

    if (!productConfig.name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    saveProductConfig(productConfig);
    res.json(productConfig);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
