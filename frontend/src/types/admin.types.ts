import { AccountType, GoalCategory } from './api.types';

export interface AdminUser {
  email: string;
}

export interface AdminStats {
  totalUsers: number;
  totalAccounts: number;
  totalTransactions: number;
  totalGoals: number;
  signupsByDay: Record<string, number>;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  isActive: boolean;
  _count: {
    accounts: number;
    transactions: number;
    goals: number;
  };
}

export interface AdminUsersResponse {
  users: AdminUserListItem[];
  count: number;
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  googleLinked: boolean;
  hasPassword: boolean;
  accounts: Array<{
    id: string;
    name: string;
    type: AccountType;
    bankName: string | null;
    isActive: boolean;
    createdAt: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    category: GoalCategory;
    targetDate: string;
    isActive: boolean;
    createdAt: string;
  }>;
  _count: {
    accounts: number;
    transactions: number;
    goals: number;
  };
}
