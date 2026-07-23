import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Account, AccountType, CreateAccountRequest, UpdateAccountRequest } from '../../types/api.types';

interface AccountFormProps {
  initialValues?: Account;
  onSubmit: (data: CreateAccountRequest | UpdateAccountRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const AccountForm = ({ initialValues, onSubmit, onCancel, submitting }: AccountFormProps) => {
  const isEditing = !!initialValues;
  const [name, setName] = useState(initialValues?.name ?? '');
  const [type, setType] = useState<AccountType>(initialValues?.type ?? AccountType.CHECKING);
  const [balance, setBalance] = useState(String(initialValues?.balance ?? 0));
  const [currency, setCurrency] = useState(initialValues?.currency ?? 'USD');
  const [bankName, setBankName] = useState(initialValues?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(initialValues?.accountNumber ?? '');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload = isEditing
      ? {
          name,
          balance: Number(balance),
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
        }
      : {
          name,
          type,
          balance: Number(balance),
          currency,
          bankName: bankName || undefined,
          accountNumber: accountNumber || undefined,
        };

    try {
      await onSubmit(payload);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        {isEditing ? 'Edit Account' : 'Add Account'}
      </h2>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700">
            Type
          </label>
          <select
            id="type"
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            <option value={AccountType.CHECKING}>Checking</option>
            <option value={AccountType.SAVINGS}>Savings</option>
            <option value={AccountType.CREDIT}>Credit</option>
            <option value={AccountType.INVESTMENT}>Investment</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="balance" className="block text-sm font-medium text-gray-700">
          Balance
        </label>
        <input
          id="balance"
          type="number"
          step="0.01"
          min="0"
          required
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
        <p className="mt-1 text-xs text-gray-500">
          {isEditing
            ? 'Manually adjusting this overrides the balance directly, separate from transaction history.'
            : 'Starting balance for this account.'}
        </p>
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currency" className="block text-sm font-medium text-gray-700">
            Currency
          </label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="bankName" className="block text-sm font-medium text-gray-700">
          Bank name (optional)
        </label>
        <input
          id="bankName"
          type="text"
          value={bankName}
          onChange={(e) => setBankName(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="accountNumber" className="block text-sm font-medium text-gray-700">
          Account number (optional)
        </label>
        <input
          id="accountNumber"
          type="text"
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Account'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default AccountForm;
