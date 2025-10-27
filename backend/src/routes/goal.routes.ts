import { Router } from 'express';
import {
  createGoal,
  getGoals,
  getGoalById,
  updateGoal,
  addContribution,
  deleteGoal,
  getGoalsSummary,
} from '../controllers/goal.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All goal routes require authentication
router.use(authenticateToken);

// Goal CRUD routes
router.post('/', createGoal);
router.get('/', getGoals);
router.get('/summary', getGoalsSummary);
router.get('/:id', getGoalById);
router.patch('/:id', updateGoal);
router.post('/:id/contribute', addContribution);
router.delete('/:id', deleteGoal);

export default router;
