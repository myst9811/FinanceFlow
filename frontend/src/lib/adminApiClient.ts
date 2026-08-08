import axios, { AxiosInstance } from 'axios';
import { API_CONFIG } from '../config/api.config';

// Deliberately separate from `apiClient.ts`: the admin panel authenticates
// via an httpOnly session cookie, not a bearer token in localStorage, so it
// must not share the regular client's Authorization-header injection or its
// 401 handling (which clears the consumer auth token and redirects to
// `/login`). Every request carries credentials so the browser sends/accepts
// the `admin_session` cookie across the frontend/backend origins.
const adminApiClient: AxiosInstance = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

export default adminApiClient;
