import apiClient from '../lib/apiClient';
import { Account, AccountSummary, CreateAccountRequest, UpdateAccountRequest } from '../types/api.types';

class AccountService {
  async getAccounts(activeOnly = true): Promise<Account[]> {
    const response = await apiClient.get<{ accounts: Account[] }>('/accounts', {
      params: { active: activeOnly },
    });
    return response.data.accounts;
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const response = await apiClient.get<{ summary: AccountSummary }>('/accounts/summary');
    return response.data.summary;
  }

  async createAccount(data: CreateAccountRequest): Promise<Account> {
    const response = await apiClient.post<{ account: Account }>('/accounts', data);
    return response.data.account;
  }

  async updateAccount(id: string, data: UpdateAccountRequest): Promise<Account> {
    const response = await apiClient.patch<{ account: Account }>(`/accounts/${id}`, data);
    return response.data.account;
  }

  async deleteAccount(id: string): Promise<void> {
    await apiClient.delete(`/accounts/${id}`);
  }
}

export default new AccountService();
