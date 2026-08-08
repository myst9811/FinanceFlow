import { createContext } from 'react';
import { AdminUser } from '../types/admin.types';

export interface AdminAuthContextType {
  admin: AdminUser | null;
  loading: boolean;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

export const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);
