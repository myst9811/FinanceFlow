import { Router } from 'express';
import { register, login, getCurrentUser, getGoogleNonce, googleLogin, linkGoogleAccount } from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { loginLimiter, registerLimiter, googleAuthLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.get('/nonce', getGoogleNonce);
router.post('/google', googleAuthLimiter, googleLogin);

// Protected routes
router.get('/me', authenticateToken, getCurrentUser);
router.post('/google/link', authenticateToken, googleAuthLimiter, linkGoogleAccount);

export default router;
