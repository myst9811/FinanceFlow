import { Router } from 'express';
import {
  getInsights,
  getInsightsSummary,
  markInsightRead,
  deleteInsight,
} from '../controllers/insight.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All insight routes require authentication
router.use(authenticateToken);

router.get('/', getInsights);
router.get('/summary', getInsightsSummary);
router.patch('/:id/read', markInsightRead);
router.delete('/:id', deleteInsight);

export default router;
