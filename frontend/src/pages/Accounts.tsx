import { useEffect, useState } from 'react';
import StatCard from '../components/common/StatCard';
import AccountForm from '../components/accounts/AccountForm';
import AccountCard from '../components/accounts/AccountCard';
import accountService from '../services/account.service';
import { Account, AccountSummary, CreateAccountRequest, UpdateAccountRequest } from '../types/api.types';
import { formatCurrency } from '../utils/formatters';

const Accounts = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    const [accountsData, summaryData] = await Promise.all([
      accountService.getAccounts(),
      accountService.getAccountSummary(),
    ]);
    setAccounts(accountsData);
    setSummary(summaryData);
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const handleCreate = () => {
    setEditingAccount(null);
    setFormMode('create');
  };

  const handleEdit = (account: Account) => {
    setEditingAccount(account);
    setFormMode('edit');
  };

  const handleDelete = async (account: Account) => {
    if (!window.confirm(`Deactivate "${account.name}"? This can't be undone from the UI.`)) {
      return;
    }
    await accountService.deleteAccount(account.id);
    await loadData();
  };

  const handleSubmit = async (data: CreateAccountRequest | UpdateAccountRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingAccount) {
        await accountService.updateAccount(editingAccount.id, data as UpdateAccountRequest);
      } else {
        await accountService.createAccount(data as CreateAccountRequest);
      }
      await loadData();
      setFormMode(null);
      setEditingAccount(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading accounts...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
        {!formMode && (
          <button onClick={handleCreate} className="btn-primary">
            Add Account
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <StatCard title="Total Balance" value={formatCurrency(summary?.totalBalance ?? 0)} />
        <StatCard title="Total Accounts" value={String(summary?.totalAccounts ?? 0)} />
      </div>

      {formMode && (
        <AccountForm
          initialValues={formMode === 'edit' ? editingAccount ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingAccount(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {accounts.length === 0 && (
          <p className="text-gray-500">No accounts yet. Add one to get started.</p>
        )}
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

export default Accounts;
