import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import adminService from '../../services/admin.service';
import { AdminUserDetail as AdminUserDetailType } from '../../types/admin.types';

const badgeClasses = 'rounded-full px-2 py-0.5 text-xs font-medium';

const AdminUserDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [user, setUser] = useState<AdminUserDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setActionError(null);

    adminService
      .getUserDetail(id)
      .then((detail) => {
        if (!cancelled) setUser(detail);
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load this user.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleToggleActive = async () => {
    if (!user) return;
    const targetIsActive = !user.isActive;
    setActionError(null);
    setPending(true);
    try {
      await adminService.updateUserStatus(user.id, targetIsActive);
      setUser({ ...user, isActive: targetIsActive });
    } catch {
      setActionError('Failed to update status.');
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return <p className="text-gray-500">Loading...</p>;
  }

  if (loadError || !user) {
    return (
      <div className="space-y-3">
        <p className="text-red-400">{loadError ?? 'User not found.'}</p>
        <Link to="/admin/users" className="text-sm text-primary-500 hover:text-primary-600">
          Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => navigate('/admin/users')}
          className="mb-3 text-sm text-gray-500 hover:text-gray-300"
        >
          ← Back to Users
        </button>
        <h1 className="text-2xl font-bold text-white">
          {user.firstName} {user.lastName}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        {actionError && (
          <p className="mb-3 rounded-md bg-red-950 p-2 text-sm text-red-400">{actionError}</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`${badgeClasses} ${
              user.isActive ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
            }`}
          >
            {user.isActive ? 'Active' : 'Deactivated'}
          </span>
          {user.hasPassword && (
            <span className={`${badgeClasses} bg-blue-950 text-blue-400`}>Password</span>
          )}
          {user.googleLinked && (
            <span className={`${badgeClasses} bg-yellow-950 text-yellow-400`}>Google</span>
          )}
          <button
            onClick={handleToggleActive}
            disabled={pending}
            className="ml-auto text-sm font-medium text-primary-500 hover:text-primary-600 disabled:opacity-50"
          >
            {user.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Joined</dt>
            <dd className="text-gray-300">{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Last updated</dt>
            <dd className="text-gray-300">{new Date(user.updatedAt).toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Accounts</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.accounts}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Transactions</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.transactions}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-sm text-gray-500">Goals</p>
          <p className="mt-1 text-2xl font-bold text-white">{user._count.goals}</p>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-400">Accounts</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Bank</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {user.accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No accounts.
                  </td>
                </tr>
              ) : (
                user.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-white">{account.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{account.type}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{account.bankName ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {account.isActive ? 'Active' : 'Inactive'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {new Date(account.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-400">Goals</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="min-w-full divide-y divide-gray-800">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Title</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Category</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Target date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 bg-gray-950">
              {user.goals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">
                    No goals.
                  </td>
                </tr>
              ) : (
                user.goals.map((goal) => (
                  <tr key={goal.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-white">{goal.title}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{goal.category}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {new Date(goal.targetDate).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                      {goal.isActive ? 'Active' : 'Inactive'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminUserDetail;
