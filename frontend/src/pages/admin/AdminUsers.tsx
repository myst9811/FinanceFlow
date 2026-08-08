import { useEffect, useState } from 'react';
import adminService from '../../services/admin.service';
import { AdminUserListItem } from '../../types/admin.types';

const PAGE_SIZE = 20;

const AdminUsers = () => {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const loadUsers = async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getUsers(targetPage, PAGE_SIZE);
      setUsers(response.users);
      setTotalPages(response.totalPages);
      setPage(response.page);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1);
  }, []);

  const handleToggleActive = async (user: AdminUserListItem) => {
    setPendingId(user.id);
    try {
      await adminService.updateUserStatus(user.id, !user.isActive);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)));
    } catch {
      setError(`Failed to update ${user.email}.`);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="mt-1 text-sm text-gray-500">Deactivating a user immediately blocks their login.</p>
      </div>

      {error && <div className="rounded-md bg-red-950 p-3 text-sm text-red-400">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="min-w-full divide-y divide-gray-800">
          <thead className="bg-gray-900">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Name</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Email</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Joined</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Accounts</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-white">
                    {user.firstName} {user.lastName}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">{user.email}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-400">
                    {user._count.accounts} acct · {user._count.transactions} txn · {user._count.goals} goal
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.isActive ? 'bg-green-950 text-green-400' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                    <button
                      onClick={() => handleToggleActive(user)}
                      disabled={pendingId === user.id}
                      className="font-medium text-primary-500 hover:text-primary-600 disabled:opacity-50"
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <button
            onClick={() => loadUsers(page - 1)}
            disabled={page <= 1 || loading}
            className="rounded-md px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => loadUsers(page + 1)}
            disabled={page >= totalPages || loading}
            className="rounded-md px-3 py-1.5 hover:bg-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminUsers;
