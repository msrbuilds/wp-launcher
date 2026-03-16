import { Router, Response } from 'express';
import { adminAuth } from '../middleware/auth';
import { AuthRequest } from '../middleware/userAuth';
import { startBulkJob, getBulkJob, listBulkJobs, cancelBulkJob, exportBulkJobCsv } from '../services/bulk.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All bulk routes require admin role or API key
router.use(adminAuth);

// Start a bulk job
router.post('/', asyncHandler(async (req: AuthRequest, res: Response) => {
  const { productId, count, expiresIn, subdomainPrefix, adminUser, adminEmail } = req.body;

  if (!productId) {
    res.status(400).json({ error: 'productId is required' });
    return;
  }

  const jobId = startBulkJob({
    productId,
    count: parseInt(count) || 1,
    expiresIn,
    subdomainPrefix,
    adminUser,
    adminEmail,
  });

  res.status(201).json({ jobId });
}));

// List all bulk jobs
router.get('/', (_req: AuthRequest, res: Response) => {
  const { data, total } = listBulkJobs();
  res.json({ data, total });
});

// Get a specific job
router.get('/:id', (req: AuthRequest, res: Response) => {
  const job = getBulkJob(req.params.id);
  res.json({
    id: job.id,
    productId: job.product_id,
    total: job.total,
    completed: job.completed,
    failed: job.failed,
    status: job.status,
    results: JSON.parse(job.results || '[]'),
    createdAt: job.created_at,
    completedAt: job.completed_at,
  });
});

// Export job results as CSV
router.get('/:id/export', (req: AuthRequest, res: Response) => {
  const csv = exportBulkJobCsv(req.params.id);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=bulk-${req.params.id}.csv`);
  res.send(csv);
});

// Cancel a running job
router.delete('/:id', (req: AuthRequest, res: Response) => {
  cancelBulkJob(req.params.id);
  res.json({ message: 'Job cancelled' });
});

export default router;
