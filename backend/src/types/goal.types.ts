import { Request } from 'express';
import { GoalCategory } from '../generated/prisma';

export interface CreateGoalRequest {
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount?: number;
  targetDate: string;
  category: GoalCategory;
}

export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  targetAmount?: number;
  currentAmount?: number;
  targetDate?: string;
  isActive?: boolean;
}

export interface GoalResponse {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  category: GoalCategory;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  progress?: number; // Calculated percentage
  remainingAmount?: number; // Calculated remaining
  daysRemaining?: number; // Days until target date
}

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}
