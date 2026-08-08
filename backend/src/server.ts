import { randomUUID } from 'crypto';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import * as Sentry from '@sentry/node';
import { config } from './config/env';
import { logger } from './lib/logger';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';
import goalRoutes from './routes/goal.routes';
import insightRoutes from './routes/insight.routes';
import adminRoutes from './routes/admin.routes';
import { healthCheck } from './controllers/health.controller';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

if (config.sentryDsn) {
  Sentry.init({ dsn: config.sentryDsn });
}

const app = express();

// Trust the first proxy hop (Vercel's edge network sits in front of the
// deployed function). Without this, req.ip resolves to the proxy's address
// for every client, which would make the auth rate limiters below share one
// bucket across all users instead of limiting per client.
app.set('trust proxy', 1);

// Middleware

app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    try {
      if (/\.vercel\.app$/.test(new URL(origin).hostname)) {
        callback(null, true);
        return;
      }
    } catch (err) {
      callback(err as Error);
      return;
    }

    callback(new Error('Not allowed by CORS'));
  },
  // Required for the admin panel's httpOnly session cookie - without this,
  // browsers won't send or accept cookies on cross-origin requests at all,
  // regardless of the cookie's own SameSite/Secure settings. The regular
  // consumer API doesn't use cookies (Bearer tokens instead), so this has
  // no effect on it.
  credentials: true,
}));

app.use(pinoHttp({
  logger,
  // Always generate a fresh UUID server-side rather than trusting/propagating
  // a client-supplied X-Request-Id - this is a public API, and honoring
  // client-chosen trace IDs would let a caller inject arbitrary values into
  // our logs. A UUID (vs. pino-http's default per-process counter) also stays
  // unique across restarts and multiple warm serverless instances.
  genReqId: () => randomUUID(),
}));

app.use((req, res, next) => {
  res.setHeader('X-Request-Id', String(req.id));
  next();
});

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Health check

app.get('/health', healthCheck);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);

app.use('/api/insights', insightRoutes);

app.use('/api/admin', adminRoutes);

// 404 + error handling middleware

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});
