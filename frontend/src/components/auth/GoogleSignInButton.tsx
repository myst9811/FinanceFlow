import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentityScript } from '../../lib/googleIdentity';
import authService from '../../services/auth.service';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

type GoogleSignInButtonProps = {
  onCredential: (credential: string) => Promise<void>;
};

const GoogleSignInButton = ({ onCredential }: GoogleSignInButtonProps) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(async () => {
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        const nonce = await authService.getGoogleNonce();
        if (cancelled || !buttonRef.current || !window.google) {
          return;
        }

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce,
          callback: (response) => {
            onCredential(response.credential);
          },
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          width: 320,
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
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) {
    return null;
  }

  if (scriptError) {
    return (
      <p className="text-center text-sm text-red-600">
        Could not load Google Sign-In. Check your connection and reload.
      </p>
    );
  }

  return <div className="flex justify-center" ref={buttonRef} />;
};

export default GoogleSignInButton;
