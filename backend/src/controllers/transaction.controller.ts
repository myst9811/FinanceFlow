import { Response } from 'express';
import {
  CreateTransactionRequest,
  UpdateTransactionRequest,
  AuthenticatedRequest,
} from '../types/transaction.types';
import { validateTransactionInput, validateTransactionUpdate } from '../utils/validation';
import { ApiError } from '../utils/ApiError';
import {
  createTransactionForUser,
  getTransactionsForUser,
  getTransactionByIdForUser,
  updateTransactionForUser,
  deleteTransactionForUser,
  getTransactionStatsForUser,
} from '../services/transaction.service';

// Create a new transaction
export const createTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { accountId, toAccountId, amount, description, category, type, date, tags }: CreateTransactionRequest = req.body;

  const validation = validateTransactionInput(accountId, amount, description, category, type, date, toAccountId);
  if (!validation.valid) {
    throw new ApiError(400, validation.error!);
  }

  const transaction = await createTransactionForUser(req.user.userId, {
    accountId,
    toAccountId,
    amount,
    description,
    category,
    type,
    date,
    tags,
  });

  res.status(201).json({ transaction });
};

// Get all transactions for the authenticated user with filtering
export const getTransactions = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const {
    accountId,
    type,
    category,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    search,
  } = req.query as any;

  const transactions = await getTransactionsForUser(req.user.userId, {
    accountId,
    type,
    category,
    startDate,
    endDate,
    minAmount: minAmount !== undefined ? parseFloat(minAmount) : undefined,
    maxAmount: maxAmount !== undefined ? parseFloat(maxAmount) : undefined,
    search,
  });

  res.status(200).json({ transactions, count: transactions.length });
};

// Get a single transaction by ID
export const getTransactionById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  const transaction = await getTransactionByIdForUser(req.user.userId, id);

  res.status(200).json({ transaction });
};

// Update a transaction
export const updateTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  const { amount, description, category, date, tags }: UpdateTransactionRequest = req.body;

  const validation = validateTransactionUpdate(amount, description, category, date);
  if (!validation.valid) {
    throw new ApiError(400, validation.error!);
  }

  const transaction = await updateTransactionForUser(req.user.userId, id, {
    amount,
    description,
    category,
    date,
    tags,
  });

  res.status(200).json({ transaction });
};

// Delete a transaction
export const deleteTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  await deleteTransactionForUser(req.user.userId, id);

  res.status(200).json({ message: 'Transaction deleted successfully' });
};

// Get transaction statistics
export const getTransactionStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { startDate, endDate, accountId } = req.query as any;

  const stats = await getTransactionStatsForUser(req.user.userId, {
    accountId,
    startDate,
    endDate,
  });

  res.status(200).json({ stats });
};
