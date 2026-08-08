import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigins: string[];
  sentryDsn?: string;
  googleClientId: string;
  adminJwtSecret: string;
  adminEmail: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? 3001);
  if (Number.isNaN(port)) {
    throw new Error('PORT must be a number');
  }

  return {
    port,
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    sentryDsn: process.env.SENTRY_DSN,
    googleClientId: required('GOOGLE_CLIENT_ID'),
    adminJwtSecret: required('ADMIN_JWT_SECRET'),
    adminEmail: required('ADMIN_EMAIL'),
  };
}

export const config = loadConfig();
