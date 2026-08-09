import { Router } from 'express';
import { register, login, getCurrentUser, getGoogleNonce } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/nonce', getGoogleNonce);

// Protected routes
router.get('/me', authenticateToken, getCurrentUser);

export default router;
