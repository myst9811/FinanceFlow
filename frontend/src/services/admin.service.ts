import adminApiClient from '../lib/adminApiClient';
import { AdminStats, AdminUser, AdminUsersResponse } from '../types/admin.types';

class AdminService {
  async loginWithGoogle(credential: string): Promise<AdminUser> {
    const response = await adminApiClient.post<AdminUser>('/admin/auth/google', { credential });
    return response.data;
  }

  async logout(): Promise<void> {
    await adminApiClient.post('/admin/auth/logout');
  }

  async getCurrentAdmin(): Promise<AdminUser> {
    const response = await adminApiClient.get<AdminUser>('/admin/auth/me');
    return response.data;
  }

  async getStats(): Promise<AdminStats> {
    const response = await adminApiClient.get<{ stats: AdminStats }>('/admin/stats');
    return response.data.stats;
  }

  async getUsers(page = 1, limit = 20): Promise<AdminUsersResponse> {
    const response = await adminApiClient.get<AdminUsersResponse>('/admin/users', {
      params: { page, limit },
    });
    return response.data;
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<void> {
    await adminApiClient.patch(`/admin/users/${id}/status`, { isActive });
  }
}

export default new AdminService();
