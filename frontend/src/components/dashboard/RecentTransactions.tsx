import { Link } from 'react-router-dom';
import { Transaction, TransactionType } from '../../types/api.types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface RecentTransactionsProps {
  transactions: Transaction[];
  limit?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_DINING: 'Food & Dining',
  TRANSPORTATION: 'Transportation',
  SHOPPING: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  BILLS_UTILITIES: 'Bills & Utilities',
  HEALTHCARE: 'Healthcare',
  EDUCATION: 'Education',
  TRAVEL: 'Travel',
  INCOME_SALARY: 'Salary',
  INCOME_BUSINESS: 'Business Income',
  TRANSFER: 'Transfer',
  OTHER: 'Other',
};

const RecentTransactions = ({ transactions, limit = 5 }: RecentTransactionsProps) => {
  const recentTransactions = transactions.slice(0, limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-ink">Recent Transactions</h3>
        <Link to="/transactions" className="text-accent hover:opacity-80 text-sm font-medium">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {recentTransactions.length === 0 && (
          <p className="text-sm text-ink-muted">No transactions yet.</p>
        )}
        {recentTransactions.map((transaction) => (
          <div key={transaction.id} className="flex items-center justify-between py-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                {transaction.description}
              </p>
              <p className="text-xs text-ink-muted">
                {CATEGORY_LABELS[transaction.category] ?? transaction.category} • {formatDateShort(transaction.date)}
              </p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-medium ${
                transaction.type === TransactionType.INCOME ? 'text-success' : 'text-ink'
              }`}>
                {transaction.type === TransactionType.INCOME ? '+' : '-'}{formatCurrency(transaction.amount)}
              </p>
              <p className="text-xs text-ink-muted">{transaction.account.name}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;
