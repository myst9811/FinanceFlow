import { Request } from 'express';
import { AccountType } from '../generated/prisma';

export interface CreateAccountRequest {
  name: string;
  type: AccountType;
  balance?: number;
  currency?: string;
  bankName?: string;
  accountNumber?: string;
}

export interface UpdateAccountRequest {
  name?: string;
  balance?: number;
  isActive?: boolean;
  bankName?: string;
  accountNumber?: string;
}

export interface AccountResponse {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  isActive: boolean;
  bankName?: string | null;
  accountNumber?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
