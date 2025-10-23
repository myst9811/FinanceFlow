import React from 'react';
import { Transaction } from '../../types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface RecentTransactionsProps {
  transactions: Transaction[];
  limit?: number;
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ 
  transactions, 
  limit = 5 
}) => {
  const recentTransactions = transactions.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Transactions</h3>
        <a href="/transactions" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
          View all
        </a>
      </div>
      <div className="space-y-3">
        {recentTransactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">
                {transaction.description}
              </p>
              <p className="text-xs text-gray-500">
                {transaction.category} • {formatDateShort(transaction.date)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${
                transaction.type === 'income' ? 'text-success' : 'text-gray-900'
              }`}>
                {transaction.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
              </p>
              <p className="text-xs text-gray-500">{transaction.account}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;