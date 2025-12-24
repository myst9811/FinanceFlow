import apiClient from '../lib/apiClient';
import { AUTH_TOKEN_KEY } from '../config/api.config';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../types/api.types';

class AuthService {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    if (response.data.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
    }
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    if (response.data.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
    }
    return response.data;
  }

  async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<{ user: User }>('/auth/me');
    return response.data.user;
  }

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.href = '/login';
  }

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export default new AuthService();
