import { useCallback, useEffect, useState } from 'react';

const SEEN_KEY = 'chronosfin:landingIntroSeen';
const FAILSAFE_MS = 2200; // sequence is ~1.3s; generous margin before forcing dismissal

function hasPlayedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false; // storage unavailable → play, harmlessly
  }
}

function markPlayed(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* replaying once more next load in this session is harmless */
  }
}

export function useLandingIntro() {
  const [playing, setPlaying] = useState(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || hasPlayedThisSession()) {
      markPlayed();
      return false;
    }
    return true;
  });

  const finish = useCallback(() => setPlaying(false), []);

  useEffect(() => {
    if (!playing) return;

    markPlayed();
    document.body.style.overflow = 'hidden';
    const failsafe = window.setTimeout(finish, FAILSAFE_MS);

    return () => {
      document.body.style.overflow = '';
      window.clearTimeout(failsafe);
    };
  }, [playing, finish]);

  return { playing, finish };
}
