import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';
import goalRoutes from './routes/goal.routes';
import insightRoutes from './routes/insight.routes';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

const app = express();


// Middleware

app.use(helmet());

app.use(cors({ origin: config.corsOrigins }));

app.use(morgan('combined'));

app.use(express.json());

app.use(express.urlencoded({ extended: true }));

  

// Health check

app.get('/health', (req, res) => {

  res.json({ status: 'OK', timestamp: new Date().toISOString() });

});

  

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);

app.use('/api/insights', insightRoutes);

  

// 404 + error handling middleware

app.use(notFoundHandler);
app.use(errorHandler);
  

app.listen(config.port, () => {

  console.log(`🚀 Server running on port ${config.port}`);

});