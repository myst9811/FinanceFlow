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
