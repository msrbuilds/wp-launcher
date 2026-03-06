import { Router, Request, Response } from 'express';
import { listProducts, getProductConfig, saveProductConfig } from '../services/product.service';

const router = Router();

// List all products
router.get('/', (_req: Request, res: Response) => {
  try {
    const products = listProducts();
    res.json(products);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific product config
router.get('/:id', (req: Request, res: Response) => {
  try {
    const product = getProductConfig(req.params.id);
    res.json(product);
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
