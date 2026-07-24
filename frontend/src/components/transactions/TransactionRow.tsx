import { Transaction, TransactionType } from '../../types/api.types';
import { formatCurrency, formatDateShort } from '../../utils/formatters';

interface TransactionRowProps {
  transaction: Transaction;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
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

const AMOUNT_STYLES: Record<TransactionType, string> = {
  [TransactionType.INCOME]: 'text-success',
  [TransactionType.EXPENSE]: 'text-gray-900',
  [TransactionType.TRANSFER]: 'text-primary-600',
};

const AMOUNT_PREFIX: Record<TransactionType, string> = {
  [TransactionType.INCOME]: '+',
  [TransactionType.EXPENSE]: '-',
  [TransactionType.TRANSFER]: '',
};

const TransactionRow = ({ transaction, onEdit, onDelete }: TransactionRowProps) => {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <p className="font-medium text-gray-900">{transaction.description}</p>
        <p className="mt-1 text-sm text-gray-500">
          {CATEGORY_LABELS[transaction.category] ?? transaction.category} · {formatDateShort(transaction.date)} ·{' '}
          {transaction.account.name}
          {transaction.toAccount && ` → ${transaction.toAccount.name}`}
        </p>
      </div>

      <div className="flex items-center gap-4">
        <p className={`text-lg font-semibold ${AMOUNT_STYLES[transaction.type]}`}>
          {AMOUNT_PREFIX[transaction.type]}
          {formatCurrency(transaction.amount)}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onEdit(transaction)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(transaction)}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionRow;
