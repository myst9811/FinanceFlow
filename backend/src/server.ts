import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import accountRoutes from './routes/account.routes';
import transactionRoutes from './routes/transaction.routes';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

  
// Middleware

app.use(helmet());

app.use(cors());

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

// TODO: Implement remaining routes
// app.use('/api/goals', goalRoutes);
// app.use('/api/insights', insightRoutes);

  

// Error handling middleware

app.use((err: any, req: any, res: any, next: any) => {

  console.error(err.stack);

  res.status(500).json({ error: 'Something went wrong!' });

});

  

app.listen(PORT, () => {

  console.log(`🚀 Server running on port ${PORT}`);

});