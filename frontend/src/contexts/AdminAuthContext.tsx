import React, { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import adminService from '../services/admin.service';
import { AdminUser } from '../types/admin.types';
import { AdminAuthContext } from './admin-auth-context';

export const AdminAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Bumped whenever loginWithGoogle/logout start, so a slower in-flight
  // operation (e.g. the initial getCurrentAdmin probe) can't land its result
  // after a newer one and clobber the current auth state.
  const authOpRef = useRef(0);

  useEffect(() => {
    const opId = authOpRef.current;
    const initAdminAuth = async () => {
      try {
        const currentAdmin = await adminService.getCurrentAdmin();
        if (authOpRef.current === opId) setAdmin(currentAdmin);
      } catch {
        if (authOpRef.current === opId) setAdmin(null);
      } finally {
        if (authOpRef.current === opId) setLoading(false);
      }
    };

    initAdminAuth();
  }, []);

  const loginWithGoogle = useCallback(async (credential: string) => {
    authOpRef.current += 1;
    const loggedInAdmin = await adminService.loginWithGoogle(credential);
    setAdmin(loggedInAdmin);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    authOpRef.current += 1;
    await adminService.logout();
    setAdmin(null);
  }, []);

  const value = useMemo(
    () => ({
      admin,
      loading,
      loginWithGoogle,
      logout,
      isAuthenticated: !!admin,
    }),
    [admin, loading, loginWithGoogle, logout]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
};
