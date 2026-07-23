import { Account } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatters';

interface AccountCardProps {
  account: Account;
  onEdit: (account: Account) => void;
  onDelete: (account: Account) => void;
}

const TYPE_LABELS: Record<string, string> = {
  CHECKING: 'Checking',
  SAVINGS: 'Savings',
  CREDIT: 'Credit',
  INVESTMENT: 'Investment',
};

const AccountCard = ({ account, onEdit, onDelete }: AccountCardProps) => {
  return (
    <div className="card flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900">{account.name}</p>
          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
            {TYPE_LABELS[account.type] ?? account.type}
          </span>
        </div>
        {account.bankName && (
          <p className="mt-1 text-sm text-gray-500">{account.bankName}</p>
        )}
      </div>

      <div className="flex items-center gap-4">
        <p className="text-lg font-semibold text-gray-900">
          {formatCurrency(account.balance, account.currency)}
        </p>
        <div className="flex gap-2">
          <button onClick={() => onEdit(account)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(account)}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountCard;
