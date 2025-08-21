import { Transaction, Goal, Category, Account, Budget } from '../types/index.ts';

export const mockTransactions: Transaction[] = [
  {
    id: 1,
    date: '2025-08-05',
    description: 'Grocery Store',
    amount: -85.50,
    category: 'Food & Dining',
    type: 'expense',
    account: 'Checking'
  },
  {
    id: 2,
    date: '2025-08-04',
    description: 'Salary Deposit',
    amount: 3500.00,
    category: 'Income',
    type: 'income',
    account: 'Checking'
  },
  {
    id: 3,
    date: '2025-08-03',
    description: 'Gas Station',
    amount: -45.20,
    category: 'Transportation',
    type: 'expense',
    account: 'Credit Card'
  },
  {
    id: 4,
    date: '2025-08-02',
    description: 'Netflix Subscription',
    amount: -15.99,
    category: 'Entertainment',
    type: 'expense',
    account: 'Credit Card'
  },
  {
    id: 5,
    date: '2025-08-01',
    description: 'Coffee Shop',
    amount: -4.50,
    category: 'Food & Dining',
    type: 'expense',
    account: 'Checking'
  },
  {
    id: 6,
    date: '2025-07-31',
    description: 'Freelance Payment',
    amount: 750.00,
    category: 'Income',
    type: 'income',
    account: 'Checking'
  },
  {
    id: 7,
    date: '2025-07-30',
    description: 'Electric Bill',
    amount: -120.45,
    category: 'Bills & Utilities',
    type: 'expense',
    account: 'Checking'
  },
  {
    id: 8,
    date: '2025-07-29',
    description: 'Amazon Purchase',
    amount: -67.89,
    category: 'Shopping',
    type: 'expense',
    account: 'Credit Card'
  }
];

export const mockCategories: Category[] = [
  { name: 'Food & Dining', color: '#ef4444' },
  { name: 'Transportation', color: '#f59e0b' },
  { name: 'Entertainment', color: '#8b5cf6' },
  { name: 'Shopping', color: '#06b6d4' },
  { name: 'Bills & Utilities', color: '#84cc16' },
  { name: 'Healthcare', color: '#f97316' },
  { name: 'Income', color: '#10b981' },
  { name: 'Other', color: '#6b7280' }
];

export const mockGoals: Goal[] = [
  {
    id: 1,
    name: 'Emergency Fund',
    targetAmount: 10000,
    currentAmount: 6500,
    deadline: '2025-12-31',
    category: 'Savings'
  },
  {
    id: 2,
    name: 'Vacation Fund',
    targetAmount: 3000,
    currentAmount: 1200,
    deadline: '2025-10-15',
    category: 'Travel'
  },
  {
    id: 3,
    name: 'New Laptop',
    targetAmount: 1500,
    currentAmount: 450,
    deadline: '2025-09-30',
    category: 'Technology'
  }
];

export const mockAccounts: Account[] = [
  {
    id: 1,
    name: 'Checking Account',
    type: 'checking',
    balance: 2450.75
  },
  {
    id: 2,
    name: 'Savings Account',
    type: 'savings',
    balance: 8750.00
  },
  {
    id: 3,
    name: 'Credit Card',
    type: 'credit',
    balance: -1250.30
  }
];

export const mockBudgets: Budget[] = [
  {
    id: 1,
    category: 'Food & Dining',
    budgetAmount: 400,
    spentAmount: 285.50,
    period: 'monthly'
  },
  {
    id: 2,
    category: 'Transportation',
    budgetAmount: 200,
    spentAmount: 145.20,
    period: 'monthly'
  },
  {
    id: 3,
    category: 'Entertainment',
    budgetAmount: 150,
    spentAmount: 89.99,
    period: 'monthly'
  },
  {
    id: 4,
    category: 'Shopping',
    budgetAmount: 300,
    spentAmount: 267.89,
    period: 'monthly'
  }
];