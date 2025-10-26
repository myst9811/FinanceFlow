import { Response } from 'express';
import { PrismaClient } from '../generated/prisma';
import {
  CreateAccountRequest,
  UpdateAccountRequest,
  AccountResponse,
  AuthenticatedRequest,
} from '../types/account.types';
import { validateAccountInput, validateAccountUpdate } from '../utils/validation';

const prisma = new PrismaClient();

// Create a new account
export const createAccount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { name, type, balance, currency, bankName, accountNumber }: CreateAccountRequest = req.body;

    // Validate input
    const validation = validateAccountInput(name, type, balance, currency);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Create account
    const account = await prisma.account.create({
      data: {
        userId: req.user.userId,
        name: name.trim(),
        type,
        balance: balance || 0,
        currency: currency || 'USD',
        bankName: bankName?.trim(),
        accountNumber: accountNumber?.trim(),
      },
    });

    res.status(201).json({ account });
  } catch (error) {
    console.error('Create account error:', error);
    res.status(500).json({ error: 'Error creating account' });
  }
};

// Get all accounts for the authenticated user
export const getAccounts = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { active } = req.query;

    const accounts = await prisma.account.findMany({
      where: {
        userId: req.user.userId,
        ...(active !== undefined && { isActive: active === 'true' }),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({ accounts, count: accounts.length });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: 'Error fetching accounts' });
  }
};

// Get a single account by ID
export const getAccountById = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    const account = await prisma.account.findFirst({
      where: {
        id,
        userId: req.user.userId, // Ensure user can only access their own accounts
      },
    });

    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.status(200).json({ account });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ error: 'Error fetching account' });
  }
};

// Update an account
export const updateAccount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;
    const { name, balance, isActive, bankName, accountNumber }: UpdateAccountRequest = req.body;

    // Validate input
    const validation = validateAccountUpdate(name, balance, isActive);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Check if account exists and belongs to user
    const existingAccount = await prisma.account.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingAccount) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Update account
    const account = await prisma.account.update({
      where: { id },
      data: {
        ...(name && { name: name.trim() }),
        ...(balance !== undefined && { balance }),
        ...(isActive !== undefined && { isActive }),
        ...(bankName !== undefined && { bankName: bankName?.trim() || null }),
        ...(accountNumber !== undefined && { accountNumber: accountNumber?.trim() || null }),
      },
    });

    res.status(200).json({ account });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ error: 'Error updating account' });
  }
};

// Delete an account
export const deleteAccount = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const { id } = req.params;

    // Check if account exists and belongs to user
    const existingAccount = await prisma.account.findFirst({
      where: {
        id,
        userId: req.user.userId,
      },
    });

    if (!existingAccount) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // Soft delete by setting isActive to false instead of hard delete
    // This preserves transaction history
    await prisma.account.update({
      where: { id },
      data: { isActive: false },
    });

    res.status(200).json({ message: 'Account deactivated successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Error deleting account' });
  }
};

// Get account summary (total balance across all accounts)
export const getAccountSummary = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const accounts = await prisma.account.findMany({
      where: {
        userId: req.user.userId,
        isActive: true,
      },
    });

    const summary = {
      totalAccounts: accounts.length,
      totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0),
      byType: {
        CHECKING: accounts.filter(a => a.type === 'CHECKING').reduce((sum, a) => sum + a.balance, 0),
        SAVINGS: accounts.filter(a => a.type === 'SAVINGS').reduce((sum, a) => sum + a.balance, 0),
        CREDIT: accounts.filter(a => a.type === 'CREDIT').reduce((sum, a) => sum + a.balance, 0),
        INVESTMENT: accounts.filter(a => a.type === 'INVESTMENT').reduce((sum, a) => sum + a.balance, 0),
      },
    };

    res.status(200).json({ summary });
  } catch (error) {
    console.error('Get account summary error:', error);
    res.status(500).json({ error: 'Error fetching account summary' });
  }
};
