import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AdminRequest } from '../types/admin.types';

export function requireAdmin(req: AdminRequest, res: Response, next: NextFunction): void {
  const token = req.cookies?.admin_session;
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.adminJwtSecret) as { email: string };
    if (payload.email.toLowerCase() !== config.adminEmail.toLowerCase()) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    req.admin = { email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
