import { Response } from 'express';
import { PrismaClient } from '../generated/prisma';
import {
  CreateTransactionRequest,
  UpdateTransactionRequest,
  AuthenticatedRequest,
  TransactionFilters,
} from '../types/transaction.types';
import { validateTransactionInput, validateTransactionUpdate } from '../utils/validation';

const prisma = new PrismaClient();

// Create a new transaction
export const createTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { accountId, amount, description, category, type, date, tags }: CreateTransactionRequest = req.body;

    // Validate input
    const validation = validateTransactionInput(accountId, amount, description, category, type, date);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Verify account exists and belongs to user
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        userId: req.user.userId,
      },
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Create transaction
    const transaction = await prisma.transaction.create({
      data: {
        userId: req.user.userId,
        accountId,
        amount,
        description: description.trim(),
        category,
        type,
        date: new Date(date),
        tags: tags || [],
      },
      include: {
        account: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    // Update account balance based on transaction type
    let newBalance = account.balance;
    if (type === 'INCOME') {
      newBalance += amount;
    } else if (type === 'EXPENSE') {
      newBalance -= amount;
    }

    await prisma.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Create transaction error:', error);
    res.status(500).json({ error: 'Error creating transaction' });
  }
};

// Get all transactions for the authenticated user with filtering
export const getTransactions = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
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

    // Build filter object
    const where: any = {
      userId: req.user.userId,
    };

    if (accountId) {
      where.accountId = accountId;
    }

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {};
      if (minAmount !== undefined) {
        where.amount.gte = parseFloat(minAmount);
      }
      if (maxAmount !== undefined) {
        where.amount.lte = parseFloat(maxAmount);
      }
    }

    if (search) {
      where.description = {
        contains: search,
        mode: 'insensitive',
      };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        account: {
          select: {
            name: true,
            type: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    res.status(200).json({ transactions, count: transactions.length });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Error fetching transactions' });
  }
};

// Get a single transaction by ID
export const getTransactionById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
      include: {
        account: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    if (!transaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    res.status(200).json({ transaction });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Error fetching transaction' });
  }
};

// Update a transaction
export const updateTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { amount, description, category, date, tags }: UpdateTransactionRequest = req.body;

    // Validate input
    const validation = validateTransactionUpdate(amount, description, category, date);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Check if transaction exists and belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTransaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    // If amount is being updated, adjust account balance
    if (amount !== undefined && amount !== existingTransaction.amount) {
      const account = await prisma.account.findUnique({
        where: { id: existingTransaction.accountId },
      });

      if (account) {
        let balanceAdjustment = 0;
        const amountDiff = amount - existingTransaction.amount;

        if (existingTransaction.type === 'INCOME') {
          balanceAdjustment = amountDiff;
        } else if (existingTransaction.type === 'EXPENSE') {
          balanceAdjustment = -amountDiff;
        }

        await prisma.account.update({
          where: { id: account.id },
          data: { balance: account.balance + balanceAdjustment },
        });
      }
    }

    // Update transaction
    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount }),
        ...(description && { description: description.trim() }),
        ...(category && { category }),
        ...(date && { date: new Date(date) }),
        ...(tags !== undefined && { tags }),
      },
      include: {
        account: {
          select: {
            name: true,
            type: true,
          },
        },
      },
    });

    res.status(200).json({ transaction });
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({ error: 'Error updating transaction' });
  }
};

// Delete a transaction
export const deleteTransaction = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check if transaction exists and belongs to user
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingTransaction) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    // Adjust account balance before deletion
    const account = await prisma.account.findUnique({
      where: { id: existingTransaction.accountId },
    });

    if (account) {
      let balanceAdjustment = 0;

      if (existingTransaction.type === 'INCOME') {
        balanceAdjustment = -existingTransaction.amount;
      } else if (existingTransaction.type === 'EXPENSE') {
        balanceAdjustment = existingTransaction.amount;
      }

      await prisma.account.update({
        where: { id: account.id },
        data: { balance: account.balance + balanceAdjustment },
      });
    }

    // Delete transaction
    await prisma.transaction.delete({
      where: { id },
    });

    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ error: 'Error deleting transaction' });
  }
};

// Get transaction statistics
export const getTransactionStats = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { startDate, endDate, accountId } = req.query as any;

    // Build filter
    const where: any = {
      userId: req.user.userId,
    };

    if (accountId) {
      where.accountId = accountId;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate);
      }
      if (endDate) {
        where.date.lte = new Date(endDate);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
    });

    // Calculate statistics
    const totalIncome = transactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + t.amount, 0);

    const netIncome = totalIncome - totalExpenses;

    // Group by category
    const byCategory: Record<string, number> = {};
    transactions.forEach(t => {
      if (!byCategory[t.category]) {
        byCategory[t.category] = 0;
      }
      byCategory[t.category] += t.type === 'EXPENSE' ? t.amount : 0;
    });

    // Get recent transactions (last 5)
    const recentTransactions = transactions
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 5);

    const stats = {
      totalTransactions: transactions.length,
      totalIncome,
      totalExpenses,
      netIncome,
      byCategory,
      recentTransactions,
    };

    res.status(200).json({ stats });
  } catch (error) {
    console.error('Get transaction stats error:', error);
    res.status(500).json({ error: 'Error fetching transaction statistics' });
  }
};
