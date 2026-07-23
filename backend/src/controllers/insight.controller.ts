import { Response } from 'express';
import { AuthenticatedRequest } from '../types/insight.types';
import { ApiError } from '../utils/ApiError';
import {
  getInsightsForUser,
  getInsightsSummaryForUser,
  markInsightReadForUser,
  deleteInsightForUser,
} from '../services/insight.service';

// Get all insights for the authenticated user, filtered by read status/type/priority
export const getInsights = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { isRead, type, priority } = req.query as any;

  const insights = await getInsightsForUser(req.user.userId, {
    isRead: isRead !== undefined ? isRead === 'true' : undefined,
    type,
    priority,
  });

  res.status(200).json({ insights, count: insights.length });
};

// Get insight summary counts for the authenticated user
export const getInsightsSummary = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const summary = await getInsightsSummaryForUser(req.user.userId);

  res.status(200).json({ summary });
};

// Mark an insight as read
export const markInsightRead = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  const insight = await markInsightReadForUser(req.user.userId, id);

  res.status(200).json({ insight });
};

// Delete an insight
export const deleteInsight = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new ApiError(401, 'Not authenticated');
  }

  const { id } = req.params;
  await deleteInsightForUser(req.user.userId, id);

  res.status(200).json({ message: 'Insight deleted successfully' });
};
