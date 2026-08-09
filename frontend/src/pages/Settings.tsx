import { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import authService from '../services/auth.service';

const Settings = () => {
  const { user, refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const linked = user?.googleLinked ?? false;

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await authService.linkGoogleAccount(credential);
      await refreshUser(); // picks up googleLinked: true from /auth/me
      setSuccess(true);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to link Google account';
      setError(message);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-ink">Settings</h1>

      <div className="card space-y-4 p-6">
        <div>
          <p className="text-sm font-medium text-ink">Name</p>
          <p className="text-sm text-ink-muted">{user?.firstName} {user?.lastName}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-ink">Email</p>
          <p className="text-sm text-ink-muted">{user?.email}</p>
        </div>

        <div className="border-t border-line pt-4">
          <p className="mb-2 text-sm font-medium text-ink">Google account</p>

          {error && (
            <div className="mb-3 rounded-md bg-danger/10 p-3 text-sm text-danger">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-md bg-success/10 p-3 text-sm text-success">Google account linked.</div>
          )}

          {linked ? (
            <p className="text-sm text-ink-muted">Your Google account is linked. You can sign in with either method.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-ink-muted">Link your Google account to also sign in with it.</p>
              <GoogleSignInButton onCredential={handleGoogleCredential} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
