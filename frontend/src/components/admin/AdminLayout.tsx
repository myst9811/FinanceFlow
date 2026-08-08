import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
  }`;

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { admin, logout } = useAdminAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await logout();
    } catch {
      setSignOutError('Sign out failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              ChronosFin Admin
            </span>
            <div className="flex gap-1">
              <NavLink to="/admin" end className={navLinkClasses}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/users" className={navLinkClasses}>
                Users
              </NavLink>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {signOutError && <span className="text-sm text-red-400">{signOutError}</span>}
            <span className="text-sm text-gray-500">{admin?.email}</span>
            <button
              onClick={handleSignOut}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
};

export default AdminLayout;
