export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001/api',
  timeout: 10000,
};

export const AUTH_TOKEN_KEY = 'financeflow_auth_token';
