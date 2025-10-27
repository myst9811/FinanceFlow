import { Request } from 'express';
import { TransactionType, TransactionCategory } from '../generated/prisma';

export interface CreateTransactionRequest {
  accountId: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags?: string[];
}

export interface UpdateTransactionRequest {
  amount?: number;
  description?: string;
  category?: TransactionCategory;
  date?: string;
  tags?: string[];
}

export interface TransactionResponse {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: Date;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionFilters {
  accountId?: string;
  type?: TransactionType;
  category?: TransactionCategory;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
