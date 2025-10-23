import React from 'react';
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon
} from '@heroicons/react/24/outline';
import StatCard from '../components/dashboard/StatCard';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import { mockTransactions } from '../data/mockData';
import { formatCurrency } from '../utils/formatters';

const Dashboard: React.FC = () => {
  // Calculate dashboard statistics
  const totalIncome = mockTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = Math.abs(
    mockTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const netBalance = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? ((netBalance / totalIncome) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back! Here's your financial overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Balance"
          value={formatCurrency(netBalance)}
          change={`${savingsRate}% savings rate`}
          changeType="positive"
          icon={WalletIcon}
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(totalIncome)}
          change="+12.5% from last month"
          changeType="positive"
          icon={ArrowTrendingUpIcon}
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(totalExpenses)}
          change="-8.2% from last month"
          changeType="positive"
          icon={ArrowTrendingDownIcon}
        />
        <StatCard
          title="Net Savings"
          value={formatCurrency(netBalance)}
          change={`${savingsRate}% of income`}
          changeType="positive"
          icon={BanknotesIcon}
        />
      </div>

      {/* Charts Row - Placeholder for future charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Spending by Category</h3>
          <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Income vs Expenses</h3>
          <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
            <p className="text-gray-500">Chart coming soon...</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={mockTransactions} limit={8} />

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="btn-primary">
            Add Transaction
          </button>
          <button className="btn-secondary">
            Create Budget
          </button>
          <button className="btn-secondary">
            Set Goal
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
