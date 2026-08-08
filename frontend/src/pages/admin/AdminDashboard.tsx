import { useEffect, useState } from 'react';
import adminService from '../../services/admin.service';
import { AdminStats } from '../../types/admin.types';

const StatCard = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
    <p className="text-sm text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-bold text-white">{value.toLocaleString()}</p>
  </div>
);

const AdminDashboard = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService
      .getStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats.'));
  }, []);

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!stats) {
    return <p className="text-gray-500">Loading...</p>;
  }

  const signupDays = Object.keys(stats.signupsByDay).sort();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">System-wide stats across all users.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Total accounts" value={stats.totalAccounts} />
        <StatCard label="Total transactions" value={stats.totalTransactions} />
        <StatCard label="Total goals" value={stats.totalGoals} />
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-400">Signups, last 30 days</h2>
        {signupDays.length === 0 ? (
          <p className="text-sm text-gray-500">No signups in this window.</p>
        ) : (
          <ul className="space-y-1">
            {signupDays.map((day) => (
              <li key={day} className="flex justify-between text-sm">
                <span className="text-gray-400">{day}</span>
                <span className="font-medium text-white">{stats.signupsByDay[day]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
