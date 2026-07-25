import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import StatCard from '../components/common/StatCard';
import GoalForm from '../components/goals/GoalForm';
import GoalCard from '../components/goals/GoalCard';
import goalService from '../services/goal.service';
import { CreateGoalRequest, Goal, GoalSummary, UpdateGoalRequest } from '../types/api.types';
import { formatCurrency, formatPercentage } from '../utils/formatters';

const Goals = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [summary, setSummary] = useState<GoalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Used for the initial load and the Retry button: failure here means
  // there's nothing to show yet, so a full blocking error screen is the
  // right response.
  const loadAll = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const [goalsData, summaryData] = await Promise.all([
        goalService.getGoals(),
        goalService.getGoalSummary(),
      ]);
      if (requestIdRef.current !== requestId) return;
      setGoals(goalsData);
      setSummary(summaryData);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError('Failed to load goals. Please try again.');
    } finally {
      if (requestIdRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  // Used after a mutation (create/edit/delete/contribute) already
  // succeeded. A refresh failure here must NOT look like the mutation
  // itself failed -- the write already went through, so this only ever
  // shows a small non-blocking notice, never the full-page error state.
  const refreshQuietly = useCallback(async () => {
    try {
      const [goalsData, summaryData] = await Promise.all([
        goalService.getGoals(),
        goalService.getGoalSummary(),
      ]);
      setGoals(goalsData);
      setSummary(summaryData);
    } catch {
      setActionError('Saved, but the list could not refresh. Reload the page to see the latest data.');
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadAll();
  }, [loadAll]);

  const handleCreate = () => {
    setEditingGoal(null);
    setFormMode('create');
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormMode('edit');
  };

  const handleDelete = async (goal: Goal) => {
    if (!window.confirm(`Delete "${goal.title}"? This can't be undone.`)) {
      return;
    }
    setActionError(null);
    setDeletingId(goal.id);
    try {
      await goalService.deleteGoal(goal.id);
      await refreshQuietly();
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to delete goal';
      setActionError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleContribute = async (goal: Goal, amount: number) => {
    // Let a failure here throw back up to GoalCard, which displays it
    // inline -- the mutation itself genuinely failed in that case.
    await goalService.contributeToGoal(goal.id, amount);
    // A refresh failure here is handled separately (see refreshQuietly)
    // and never surfaces as a contribution failure.
    await refreshQuietly();
  };

  const handleSubmit = async (data: CreateGoalRequest | UpdateGoalRequest) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit' && editingGoal) {
        await goalService.updateGoal(editingGoal.id, data as UpdateGoalRequest);
      } else {
        await goalService.createGoal(data as CreateGoalRequest);
      }
      // Close the form as soon as the save itself succeeds, before the
      // refresh -- a slow or failed refresh afterward shouldn't leave
      // the form open or make a successful save look unfinished.
      setFormMode(null);
      setEditingGoal(null);
      await refreshQuietly();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading goals...</p>;
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
        <h1 className="text-2xl font-bold text-gray-900">Goals</h1>
        {!formMode && (
          <button onClick={handleCreate} className="btn-primary">
            Add Goal
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard title="Total Goals" value={String(summary?.totalGoals ?? 0)} />
        <StatCard title="Total Saved" value={formatCurrency(summary?.totalCurrentAmount ?? 0)} />
        <StatCard title="Overall Progress" value={formatPercentage(summary?.overallProgress ?? 0, false)} />
      </div>

      {actionError && (
        <div className="flex items-center justify-between rounded-md bg-red-50 p-3 text-sm text-red-700">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {formMode && (
        <GoalForm
          key={formMode === 'edit' ? editingGoal?.id : 'create'}
          initialValues={formMode === 'edit' ? editingGoal ?? undefined : undefined}
          onSubmit={handleSubmit}
          onCancel={() => {
            setFormMode(null);
            setEditingGoal(null);
          }}
          submitting={submitting}
        />
      )}

      <div className="space-y-4">
        {goals.length === 0 && <p className="text-gray-500">No goals yet. Add one to get started.</p>}
        {goals.map((goal) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onContribute={handleContribute}
            deleting={deletingId === goal.id}
          />
        ))}
      </div>
    </div>
  );
};

export default Goals;
