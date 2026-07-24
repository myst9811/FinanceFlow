import apiClient from '../lib/apiClient';
import { CreateTransactionRequest, Transaction, TransactionType, UpdateTransactionRequest } from '../types/api.types';

interface TransactionListFilters {
  accountId?: string;
  type?: TransactionType;
}

class TransactionService {
  async getTransactions(filters: TransactionListFilters = {}): Promise<Transaction[]> {
    const response = await apiClient.get<{ transactions: Transaction[] }>('/transactions', {
      params: filters,
    });
    return response.data.transactions;
  }

  async createTransaction(data: CreateTransactionRequest): Promise<Transaction> {
    const response = await apiClient.post<{ transaction: Transaction }>('/transactions', data);
    return response.data.transaction;
  }

  async updateTransaction(id: string, data: UpdateTransactionRequest): Promise<Transaction> {
    const response = await apiClient.patch<{ transaction: Transaction }>(`/transactions/${id}`, data);
    return response.data.transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    await apiClient.delete(`/transactions/${id}`);
  }
}

export default new TransactionService();
