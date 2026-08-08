import { NextFunction, Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { ApiError } from '../utils/ApiError';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const isApiError = err instanceof ApiError;

  // Expected errors (validation, not-found, etc.) aren't incidents - only log
  // and report genuinely unexpected ones, and do so even if headers were
  // already sent, so they don't vanish without a trace.
  if (!isApiError) {
    req.log.error({ err }, 'Unhandled error');
    Sentry.captureException(err);
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  if (isApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  res.status(500).json({ error: 'Something went wrong!' });
}
