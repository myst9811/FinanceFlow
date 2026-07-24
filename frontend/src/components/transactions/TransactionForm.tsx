import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import {
  Account,
  CreateTransactionRequest,
  Transaction,
  TransactionCategory,
  TransactionType,
  UpdateTransactionRequest,
} from '../../types/api.types';

interface TransactionFormProps {
  accounts: Account[];
  initialValues?: Transaction;
  onSubmit: (data: CreateTransactionRequest | UpdateTransactionRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CATEGORY_OPTIONS: Record<TransactionType, TransactionCategory[]> = {
  [TransactionType.INCOME]: [
    TransactionCategory.INCOME_SALARY,
    TransactionCategory.INCOME_BUSINESS,
    TransactionCategory.OTHER,
  ],
  [TransactionType.EXPENSE]: [
    TransactionCategory.FOOD_DINING,
    TransactionCategory.TRANSPORTATION,
    TransactionCategory.SHOPPING,
    TransactionCategory.ENTERTAINMENT,
    TransactionCategory.BILLS_UTILITIES,
    TransactionCategory.HEALTHCARE,
    TransactionCategory.EDUCATION,
    TransactionCategory.TRAVEL,
    TransactionCategory.OTHER,
  ],
  [TransactionType.TRANSFER]: [TransactionCategory.TRANSFER],
};

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

function toDateInputValue(isoDate?: string): string {
  return isoDate ? isoDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

const TransactionForm = ({ accounts, initialValues, onSubmit, onCancel, submitting }: TransactionFormProps) => {
  const isEditing = !!initialValues;

  const [accountId, setAccountId] = useState(initialValues?.accountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState('');
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? TransactionType.INCOME);
  const [amount, setAmount] = useState(String(initialValues?.amount ?? ''));
  const [category, setCategory] = useState<TransactionCategory>(
    initialValues?.category ?? CATEGORY_OPTIONS[TransactionType.INCOME][0]
  );
  const [date, setDate] = useState(toDateInputValue(initialValues?.date));
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    setCategory(CATEGORY_OPTIONS[newType][0]);
  };

  const handleAccountChange = (newAccountId: string) => {
    setAccountId(newAccountId);
    if (toAccountId === newAccountId) {
      setToAccountId('');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = isEditing
      ? {
          amount: Number(amount),
          description,
          category,
          date,
        }
      : {
          accountId,
          ...(type === TransactionType.TRANSFER ? { toAccountId } : {}),
          amount: Number(amount),
          description,
          category,
          type,
          date,
        };

    try {
      await onSubmit(payload);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    }
  };

  const toAccountOptions = accounts.filter((a) => a.id !== accountId);

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {isEditing ? 'Edit Transaction' : 'Add Transaction'}
      </h2>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!isEditing && (
        <div>
          <label htmlFor="accountId" className="block text-sm font-medium text-gray-700">
            Account
          </label>
          <select
            id="accountId"
            required
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!isEditing && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => handleTypeChange(e.target.value as TransactionType)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
            <option value={TransactionType.TRANSFER}>Transfer</option>
          </select>
        </div>
      )}

      {!isEditing && type === TransactionType.TRANSFER && (
        <div>
          <label htmlFor="toAccountId" className="block text-sm font-medium text-gray-700">
            To Account
          </label>
          <select
            id="toAccountId"
            required
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value="">Select an account</option>
            {toAccountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          Always a positive number — the Type above determines whether it's added to or subtracted from the account balance.
        </p>
      </div>

      {type === TransactionType.TRANSFER ? (
        <p className="text-sm text-gray-500">Category: Transfer</p>
      ) : (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TransactionCategory)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {CATEGORY_OPTIONS[type].map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="date" className="block text-sm font-medium text-gray-700">
          Date
        </label>
        <input
          id="date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <input
          id="description"
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Transaction'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default TransactionForm;
