import { Router } from 'express';
import {
  createAccount,
  getAccounts,
  getAccountById,
  updateAccount,
  deleteAccount,
  getAccountSummary,
} from '../controllers/account.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All account routes require authentication
router.use(authenticateToken);

// Account CRUD routes
router.post('/', createAccount);
router.get('/', getAccounts);
router.get('/summary', getAccountSummary);
router.get('/:id', getAccountById);
router.patch('/:id', updateAccount);
router.delete('/:id', deleteAccount);

export default router;
