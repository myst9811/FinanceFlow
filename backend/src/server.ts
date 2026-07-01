import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';
import goalRoutes from './routes/goal.routes';

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

// TODO: Implement remaining routes
// app.use('/api/insights', insightRoutes);

  

// Error handling middleware

app.use((err: any, req: any, res: any, next: any) => {

  console.error(err.stack);

  res.status(500).json({ error: 'Something went wrong!' });

});

  

app.listen(config.port, () => {

  console.log(`🚀 Server running on port ${config.port}`);

});