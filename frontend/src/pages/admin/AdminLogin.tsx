import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxiosError } from 'axios';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { ADMIN_CONFIG } from '../../config/admin.config';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.body.appendChild(script);
  });
}

const AdminLogin = () => {
  const { loginWithGoogle } = useAdminAuth();
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (!ADMIN_CONFIG.googleClientId) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: ADMIN_CONFIG.googleClientId,
          callback: async (response) => {
            setError(null);
            try {
              await loginWithGoogle(response.credential);
              navigate('/admin');
            } catch (err) {
              const status = (err as AxiosError).response?.status;
              setError(status === 403 ? 'This Google account is not authorized for admin access.' : 'Sign-in failed. Please try again.');
            }
          },
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setScriptError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">ChronosFin Admin</p>
        <h1 className="mb-6 text-xl font-bold text-white">Sign in</h1>

        {error && (
          <div className="mb-4 rounded-md bg-red-950 p-3 text-sm text-red-400">{error}</div>
        )}

        {!ADMIN_CONFIG.googleClientId ? (
          <div className="rounded-md bg-yellow-950 p-3 text-sm text-yellow-400">
            Admin sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID to enable it.
          </div>
        ) : scriptError ? (
          <div className="rounded-md bg-red-950 p-3 text-sm text-red-400">
            Could not load Google Sign-In. Check your connection and reload.
          </div>
        ) : (
          <div className="flex justify-center" ref={buttonRef} />
        )}
      </div>
    </div>
  );
};

export default AdminLogin;
