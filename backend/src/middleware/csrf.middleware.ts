import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin || !config.corsOrigins.includes(origin)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
