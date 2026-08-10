import React, { useCallback, useEffect, useState } from 'react';
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon
} from '@heroicons/react/24/outline';
import StatCard from '../components/common/StatCard';
import RecentTransactions from '../components/dashboard/RecentTransactions';
import accountService from '../services/account.service';
import transactionService from '../services/transaction.service';
import { AccountSummary, Transaction, TransactionStats } from '../types/api.types';
import { formatCurrency } from '../utils/formatters';

function firstDayOfMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

function today(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [summaryData, statsData, transactionsData] = await Promise.all([
        accountService.getAccountSummary(),
        transactionService.getTransactionStats({ startDate: firstDayOfMonth(), endDate: today() }),
        transactionService.getTransactions(),
      ]);
      setSummary(summaryData);
      setStats(statsData);
      setRecentTransactions(transactionsData);
    } catch {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  if (loading) {
    return <p className="text-ink-muted">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-danger">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            loadAll();
          }}
          className="btn-secondary"
        >
          Retry
        </button>
      </div>
    );
  }

  const totalIncome = stats?.totalIncome ?? 0;
  const totalExpenses = stats?.totalExpenses ?? 0;
  const netIncome = stats?.netIncome ?? 0;
  const savingsRate = totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Dashboard</h1>
        <p className="text-ink-muted mt-1">Welcome back! Here's your financial overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Balance"
          value={formatCurrency(summary?.totalBalance ?? 0)}
          icon={WalletIcon}
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(totalIncome)}
          icon={ArrowTrendingUpIcon}
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(totalExpenses)}
          icon={ArrowTrendingDownIcon}
        />
        <StatCard
          title="Net Savings"
          value={formatCurrency(netIncome)}
          change={`${savingsRate}% of income`}
          changeType={netIncome >= 0 ? 'positive' : 'negative'}
          icon={BanknotesIcon}
        />
      </div>

      {/* Charts Row - Placeholder for future charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Spending by Category</h3>
          <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
            <p className="text-ink-muted">Chart coming soon...</p>
          </div>
        </div>
        <div className="card">
          <h3 className="text-lg font-semibold text-ink mb-4">Income vs Expenses</h3>
          <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
            <p className="text-ink-muted">Chart coming soon...</p>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions transactions={recentTransactions} limit={8} />

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-ink mb-4">Quick Actions</h3>
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
