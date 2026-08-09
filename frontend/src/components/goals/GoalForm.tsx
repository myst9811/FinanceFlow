import { useState, FormEvent } from 'react';
import { AxiosError } from 'axios';
import { CreateGoalRequest, Goal, GoalCategory, UpdateGoalRequest } from '../../types/api.types';

interface GoalFormProps {
  initialValues?: Goal;
  onSubmit: (data: CreateGoalRequest | UpdateGoalRequest) => Promise<void>;
  onCancel: () => void;
  submitting: boolean;
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

function todayForInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const GoalForm = ({ initialValues, onSubmit, onCancel, submitting }: GoalFormProps) => {
  const isEditing = !!initialValues;

  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [targetAmount, setTargetAmount] = useState(String(initialValues?.targetAmount ?? ''));
  const [currentAmount, setCurrentAmount] = useState('0');
  const [targetDate, setTargetDate] = useState(
    initialValues?.targetDate ? initialValues.targetDate.slice(0, 10) : todayForInput()
  );
  const [category, setCategory] = useState<GoalCategory>(initialValues?.category ?? GoalCategory.EMERGENCY_FUND);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Edit and create diverge here on purpose: in edit mode, description
    // must always be sent as-is (including '' ) so clearing it actually
    // clears the stored value -- the backend only updates description
    // when the key is present at all, and treats '' as "set it to null".
    // Sending `undefined` for an empty description would omit the key
    // entirely and silently leave the old description in place. Create
    // mode has no existing value to preserve, so omitting an empty one
    // there is harmless and matches AccountForm's precedent for optional
    // text fields.
    const payload = isEditing
      ? {
          title,
          description,
          targetAmount: Number(targetAmount),
          targetDate,
        }
      : {
          title,
          description: description || undefined,
          targetAmount: Number(targetAmount),
          currentAmount: Number(currentAmount),
          targetDate,
          category,
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
      <h2 className="text-lg font-semibold text-ink">{isEditing ? 'Edit Goal' : 'Add Goal'}</h2>

      {error && <div className="rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>}

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-ink">
          Title
        </label>
        <input
          id="title"
          type="text"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-ink">
          Description (optional)
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      <div>
        <label htmlFor="targetAmount" className="block text-sm font-medium text-ink">
          Target Amount
        </label>
        <input
          id="targetAmount"
          type="number"
          step="0.01"
          min="0.01"
          required
          value={targetAmount}
          onChange={(e) => setTargetAmount(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="currentAmount" className="block text-sm font-medium text-ink">
            Current Amount (optional)
          </label>
          <input
            id="currentAmount"
            type="number"
            step="0.01"
            min="0"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
          />
          <p className="mt-1 text-xs text-ink-muted">How much you've already saved toward this goal.</p>
        </div>
      )}

      <div>
        <label htmlFor="targetDate" className="block text-sm font-medium text-ink">
          Target Date
        </label>
        <input
          id="targetDate"
          type="date"
          required
          min={isEditing ? undefined : todayForInput()}
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
        />
      </div>

      {!isEditing && (
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-ink">
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value as GoalCategory)}
            className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
          >
            {Object.values(GoalCategory).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ?? c}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Goal'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
};

export default GoalForm;
