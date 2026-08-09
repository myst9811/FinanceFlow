import { useState } from 'react';

const SEEN_KEY = 'chronosfin:logoIntroSeen';

function hasPlayedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false; // storage unavailable (e.g. private-mode edge cases) → play, harmlessly
  }
}

const AnimatedLogoMark = () => {
  const [animate] = useState(() => {
    const seen = hasPlayedThisSession();
    if (!seen) {
      try {
        sessionStorage.setItem(SEEN_KEY, '1');
      } catch {
        /* replaying once more next load in this session is harmless */
      }
    }
    return !seen;
  });

  return (
    <span className={`logo-mark${animate ? ' logo-mark--animate' : ''}`}>
      <img className="lm-wrap" src="/clock-growth-logo.svg" alt="" />
      <span className="logo-wordmark">
        <span className="wm-chronos">Chronos</span><span className="wm-fin">Fin</span>
      </span>
    </span>
  );
};

export default AnimatedLogoMark;
