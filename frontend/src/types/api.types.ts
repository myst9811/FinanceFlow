// Enums
export enum AccountType {
  CHECKING = 'CHECKING',
  SAVINGS = 'SAVINGS',
  CREDIT = 'CREDIT',
  INVESTMENT = 'INVESTMENT',
}

export enum TransactionType {
  INCOME = 'INCOME',
  EXPENSE = 'EXPENSE',
  TRANSFER = 'TRANSFER',
}

export enum TransactionCategory {
  FOOD_DINING = 'FOOD_DINING',
  TRANSPORTATION = 'TRANSPORTATION',
  SHOPPING = 'SHOPPING',
  ENTERTAINMENT = 'ENTERTAINMENT',
  BILLS_UTILITIES = 'BILLS_UTILITIES',
  HEALTHCARE = 'HEALTHCARE',
  EDUCATION = 'EDUCATION',
  TRAVEL = 'TRAVEL',
  INCOME_SALARY = 'INCOME_SALARY',
  INCOME_BUSINESS = 'INCOME_BUSINESS',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export enum GoalCategory {
  EMERGENCY_FUND = 'EMERGENCY_FUND',
  HOUSE_DOWN_PAYMENT = 'HOUSE_DOWN_PAYMENT',
  VACATION = 'VACATION',
  CAR = 'CAR',
  DEBT_PAYOFF = 'DEBT_PAYOFF',
  RETIREMENT = 'RETIREMENT',
  OTHER = 'OTHER',
}

// Auth Types
export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  token: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Account Types
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

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  isActive: boolean;
  bankName?: string | null;
  accountNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSummary {
  totalBalance: number;
  totalChecking: number;
  totalSavings: number;
  totalCredit: number;
  totalInvestment: number;
  accountsByType: {
    type: AccountType;
    count: number;
    totalBalance: number;
  }[];
}

// Transaction Types
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

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  amount: number;
  description: string;
  category: TransactionCategory;
  type: TransactionType;
  date: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
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

export interface TransactionStats {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  transactionCount: number;
  byCategory: {
    category: TransactionCategory;
    total: number;
    count: number;
  }[];
  recentTransactions: Transaction[];
}

// Goal Types
export interface CreateGoalRequest {
  title: string;
  description?: string;
  targetAmount: number;
  targetDate: string;
  category: GoalCategory;
}

export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  targetAmount?: number;
  targetDate?: string;
  category?: GoalCategory;
}

export interface Goal {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  category: GoalCategory;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  progress?: number;
  remainingAmount?: number;
  daysRemaining?: number;
}

export interface GoalContribution {
  amount: number;
}

export interface GoalSummary {
  totalGoals: number;
  activeGoals: number;
  totalTargetAmount: number;
  totalCurrentAmount: number;
  overallProgress: number;
  byCategory: {
    category: GoalCategory;
    count: number;
    totalTarget: number;
    totalCurrent: number;
    progress: number;
  }[];
  urgentGoals: Goal[];
}

// API Response Wrappers
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}
