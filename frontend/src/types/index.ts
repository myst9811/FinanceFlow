export interface Transaction {
  id: string;
  description: string;
  category: string;
  date: Date | string;
  type: 'income' | 'expense';
  amount: number;
  account: string;
}

export interface Budget {
  id: string;
  category: string;
  limit: number;
  spent: number;
  period: 'monthly' | 'weekly' | 'yearly';
}

export interface Account {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'investment';
  balance: number;
  currency: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  icon?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export interface DashboardStats {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsRate: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  category: string;
}

export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}
