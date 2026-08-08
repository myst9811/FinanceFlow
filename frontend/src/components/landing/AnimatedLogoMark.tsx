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
      <svg viewBox="18 18 184 184" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="dial" x1="28" y1="24" x2="178" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#263A70" />
            <stop offset="1" stopColor="#14234B" />
          </linearGradient>
          <linearGradient id="spark" x1="73" y1="156" x2="143" y2="63" gradientUnits="userSpaceOnUse">
            <stop stopColor="#65E6B4" />
            <stop offset="1" stopColor="#A8F5D5" />
          </linearGradient>
        </defs>
        <g className="lm-wrap" transform="translate(18 18)">
          <circle cx="92" cy="92" r="84" fill="url(#dial)" />
          <circle className="lm-ring" cx="92" cy="92" r="71" stroke="#6173A8" strokeOpacity=".45" strokeWidth="2" strokeDasharray="2 9" />
          <path className="lm-hand" d="M92 92V48M92 92L124 112" stroke="#DDE7FF" strokeWidth="7" strokeLinecap="round" />
          <circle className="lm-dot" cx="92" cy="92" r="7" fill="#65E6B4" />
          <path className="lm-chart" d="M45 140L82 108L140 72" stroke="url(#spark)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path className="lm-arrow" d="M128 90L140 72L118 75" stroke="#A8F5D5" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          <path className="lm-tick-1" d="M92 8V18" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-2" d="M176 92H166" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-3" d="M92 176V166" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
          <path className="lm-tick-4" d="M8 92H18" stroke="#A8F5D5" strokeWidth="5" strokeLinecap="round" opacity=".9" />
        </g>
      </svg>
      <svg viewBox="224 0 536 220" role="img" aria-hidden="true">
        <g transform="translate(224 0)">
          <text x="0" y="126" fill="#14234B" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="700" letterSpacing="-3">Chronos</text>
          <text x="284" y="126" fill="#2DBD8B" fontFamily="Inter, Arial, sans-serif" fontSize="76" fontWeight="700" letterSpacing="-3">Fin</text>
          <path d="M4 150H402" stroke="#D7E1F4" strokeWidth="3" />
          <text x="4" y="181" fill="#6173A8" fontFamily="Inter, Arial, sans-serif" fontSize="16" fontWeight="600" letterSpacing="4">TIME WELL SPENT</text>
        </g>
      </svg>
    </span>
  );
};

export default AnimatedLogoMark;
