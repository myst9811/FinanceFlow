import { useState } from 'react';
import { AxiosError } from 'axios';
import { useAuth } from '../hooks/useAuth';
import GoogleSignInButton from '../components/auth/GoogleSignInButton';
import authService from '../services/auth.service';

const Settings = () => {
  const { user } = useAuth();
  const [linked, setLinked] = useState(user?.googleLinked ?? false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleGoogleCredential = async (credential: string) => {
    setError(null);
    try {
      await authService.linkGoogleAccount(credential);
      setLinked(true);
      setSuccess(true);
    } catch (err) {
      const message = (err as AxiosError<{ error: string }>).response?.data?.error || 'Failed to link Google account';
      setError(message);
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      <div className="card space-y-4 p-6">
        <div>
          <p className="text-sm font-medium text-gray-700">Name</p>
          <p className="text-sm text-gray-500">{user?.firstName} {user?.lastName}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-700">Email</p>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Google account</p>

          {error && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">Google account linked.</div>
          )}

          {linked ? (
            <p className="text-sm text-gray-500">Your Google account is linked. You can sign in with either method.</p>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500">Link your Google account to also sign in with it.</p>
              <GoogleSignInButton onCredential={handleGoogleCredential} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
