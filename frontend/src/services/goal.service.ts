import apiClient from '../lib/apiClient';
import { CreateGoalRequest, Goal, GoalSummary, UpdateGoalRequest } from '../types/api.types';

class GoalService {
  async getGoals(activeOnly = true): Promise<Goal[]> {
    const response = await apiClient.get<{ goals: Goal[] }>('/goals', {
      params: { active: activeOnly },
    });
    return response.data.goals;
  }

  async getGoalSummary(): Promise<GoalSummary> {
    const response = await apiClient.get<{ summary: GoalSummary }>('/goals/summary');
    return response.data.summary;
  }

  async createGoal(data: CreateGoalRequest): Promise<Goal> {
    const response = await apiClient.post<{ goal: Goal }>('/goals', data);
    return response.data.goal;
  }

  async updateGoal(id: string, data: UpdateGoalRequest): Promise<Goal> {
    const response = await apiClient.patch<{ goal: Goal }>(`/goals/${id}`, data);
    return response.data.goal;
  }

  async contributeToGoal(id: string, amount: number): Promise<Goal> {
    const response = await apiClient.post<{ goal: Goal }>(`/goals/${id}/contribute`, { amount });
    return response.data.goal;
  }

  async deleteGoal(id: string): Promise<void> {
    await apiClient.delete(`/goals/${id}`);
  }
}

export default new GoalService();
