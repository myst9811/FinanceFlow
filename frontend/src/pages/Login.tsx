import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';

const Login = () => {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login({ email, password });
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Login failed';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await loginWithGoogle(credential);
      navigate('/');
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Sign-in failed';
      setError(message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="app-grid-bg" />
      <div className="card w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold text-ink">Sign in to ChronosFin</h1>

        {error && (
          <div className="mb-4 rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-2 shadow-sm focus:border-accent focus:outline-none focus:ring-accent sm:text-sm"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-ink-muted">
          <div className="h-px flex-1 bg-line" />
          OR
          <div className="h-px flex-1 bg-line" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} />

        <p className="mt-4 text-center text-sm text-ink-muted">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-accent hover:opacity-80">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
