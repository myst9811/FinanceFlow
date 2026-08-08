import { Router } from 'express';
import { googleLogin, logout, me } from '../controllers/admin/auth.controller';
import { getStats } from '../controllers/admin/stats.controller';
import { getUsers, updateUserStatus } from '../controllers/admin/users.controller';
import { requireAdmin } from '../middleware/adminAuth.middleware';
import { requireTrustedOrigin } from '../middleware/csrf.middleware';
import { googleAuthLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Every admin route requires a trusted Origin, including reads - the
// existing CORS middleware in server.ts allows any *.vercel.app origin
// (for the consumer app's own preview deployments), which would otherwise
// let an attacker-controlled Vercel-hosted page read credentialed admin
// data via a forged cross-site request.
router.use(requireTrustedOrigin);

router.post('/auth/google', googleAuthLimiter, googleLogin);
router.post('/auth/logout', requireAdmin, logout);
router.get('/auth/me', requireAdmin, me);

router.get('/stats', requireAdmin, getStats);
router.get('/users', requireAdmin, getUsers);
router.patch('/users/:id/status', requireAdmin, updateUserStatus);

export default router;
