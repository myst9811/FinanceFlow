import React, { useState, useEffect, ReactNode } from 'react';
import adminService from '../services/admin.service';
import { AdminUser } from '../types/admin.types';
import { AdminAuthContext } from './admin-auth-context';

export const AdminAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAdminAuth = async () => {
      try {
        const currentAdmin = await adminService.getCurrentAdmin();
        setAdmin(currentAdmin);
      } catch {
        setAdmin(null);
      } finally {
        setLoading(false);
      }
    };

    initAdminAuth();
  }, []);

  const loginWithGoogle = async (credential: string) => {
    const loggedInAdmin = await adminService.loginWithGoogle(credential);
    setAdmin(loggedInAdmin);
  };

  const logout = async () => {
    await adminService.logout();
    setAdmin(null);
  };

  const value = {
    admin,
    loading,
    loginWithGoogle,
    logout,
    isAuthenticated: !!admin,
  };

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};
