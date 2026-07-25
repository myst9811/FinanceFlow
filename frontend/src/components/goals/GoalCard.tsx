import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Goal } from '../../types/api.types';
import { formatCurrency } from '../../utils/formatters';

interface GoalCardProps {
  goal: Goal;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onContribute: (goal: Goal, amount: number) => Promise<void>;
  deleting: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  EMERGENCY_FUND: 'Emergency Fund',
  HOUSE_DOWN_PAYMENT: 'House Down Payment',
  VACATION: 'Vacation',
  CAR: 'Car',
  DEBT_PAYOFF: 'Debt Payoff',
  RETIREMENT: 'Retirement',
  OTHER: 'Other',
};

const GoalCard = ({ goal, onEdit, onDelete, onContribute, deleting }: GoalCardProps) => {
  const [showContribute, setShowContribute] = useState(false);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = Math.min(100, goal.progress ?? 0);
  const isCompleted = (goal.progress ?? 0) >= 100;

  const handleContribute = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await onContribute(goal, Number(amount));
      setAmount('');
      setShowContribute(false);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Something went wrong';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{goal.title}</p>
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-600">
              {CATEGORY_LABELS[goal.category] ?? goal.category}
            </span>
          </div>
          {goal.description && <p className="mt-1 text-sm text-gray-500">{goal.description}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => onEdit(goal)} className="btn-secondary">
            Edit
          </button>
          <button
            onClick={() => onDelete(goal)}
            disabled={deleting}
            className="rounded-lg px-4 py-2 font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>

      <div>
        <div className="h-2 w-full rounded-full bg-gray-100">
          <div
            className={`h-2 rounded-full ${isCompleted ? 'bg-success' : 'bg-primary-600'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
          <span>
            {formatCurrency(goal.currentAmount)} of {formatCurrency(goal.targetAmount)} ({Math.round(progress)}%)
          </span>
          <span className={isCompleted ? 'font-medium text-success' : ''}>
            {isCompleted ? 'Goal completed!' : `${goal.daysRemaining ?? 0} days left`}
          </span>
        </div>
      </div>

      {showContribute ? (
        <form onSubmit={handleContribute} className="flex items-start gap-2">
          <div className="flex-1">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              autoFocus
              disabled={submitting}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-primary-500 sm:text-sm"
            />
            {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
          </div>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Adding...' : 'Add'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setShowContribute(false);
              setError(null);
              setAmount('');
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowContribute(true)} className="btn-secondary">
          Add Funds
        </button>
      )}
    </div>
  );
};

export default GoalCard;
