import apiClient from '../lib/apiClient';
import { Insight } from '../types/api.types';

class InsightService {
  async getInsights(): Promise<Insight[]> {
    const response = await apiClient.get<{ insights: Insight[] }>('/insights');
    return response.data.insights;
  }

  async markInsightRead(id: string): Promise<Insight> {
    const response = await apiClient.patch<{ insight: Insight }>(`/insights/${id}/read`);
    return response.data.insight;
  }
}

export default new InsightService();
