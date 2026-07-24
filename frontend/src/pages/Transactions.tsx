import { useCallback, useEffect, useRef, useState } from 'react';
import TransactionForm from '../components/transactions/TransactionForm';
import TransactionRow from '../components/transactions/TransactionRow';
import transactionService from '../services/transaction.service';
import accountService from '../services/account.service';
import {
  Account,
  CreateTransactionRequest,
  Transaction,
  TransactionType,
  UpdateTransactionRequest,
} from '../types/api.types';

const Transactions = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountFilter, setAccountFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);

  const loadAll = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const [accountsData, transactionsData] = await Promise.all([
        accountService.getAccounts(),
        transactionService.getTransactions({
          accountId: accountFilter || undefined,
          type: (typeFilter || undefined) as TransactionType | undefined,
        }),
      ]);
      if (requestIdRef.current !== requestId) return;
      setAccounts(accountsData);
      setTransactions(transactionsData);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError('Failed to load transactions. Please try again.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [accountFilter, typeFilter]);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const handleCreate = () => {
    setEditingTransaction(null);
    setFormMode('create');
  };

  const handleEdit = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setFormMode('edit');
  };

  const handleDelete = async (transaction: Transaction) => {
    if (!window.confirm(`Delete "${transaction.description}"? This can't be undone.`)) {
      return;
    }
    await transactionService.deleteTransaction(transaction.id);
    await loadAll();
  };

  const handleSubmit = async (data: CreateTransactionRequest | UpdateTransactionRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingTransaction) {
        await transactionService.updateTransaction(editingTransaction.id, data as UpdateTransactionRequest);
      } else {
        await transactionService.createTransaction(data as CreateTransactionRequest);
      }
      await loadAll();
      setFormMode(null);
      setEditingTransaction(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading transactions...</p>;
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-red-700">{error}</p>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        {!formMode && (
          <div className="flex items-center gap-3">
            {accounts.length === 0 && (
              <span className="text-sm text-gray-500">Create an account first</span>
            )}
            <button
              onClick={handleCreate}
              disabled={accounts.length === 0}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Transaction
            </button>
          </div>
        )}
      </div>

      {!formMode && (
        <div className="flex gap-4">
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value={TransactionType.INCOME}>Income</option>
            <option value={TransactionType.EXPENSE}>Expense</option>
            <option value={TransactionType.TRANSFER}>Transfer</option>
          </select>
        </div>
      )}

      {formMode && (
        <TransactionForm
          key={formMode === 'edit' ? editingTransaction?.id : 'create'}
          accounts={accounts}
          initialValues={formMode === 'edit' ? editingTransaction ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingTransaction(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {transactions.length === 0 && <p className="text-gray-500">No transactions yet.</p>}
        {transactions.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
};

export default Transactions;
