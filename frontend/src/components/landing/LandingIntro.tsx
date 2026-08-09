type LandingIntroProps = {
  playing: boolean;
  onFinish: () => void;
};

const LandingIntro = ({ playing, onFinish }: LandingIntroProps) => {
  if (!playing) return null;

  return (
    <div
      className="landing-intro"
      aria-hidden="true"
      onAnimationEnd={(e) => {
        if (e.currentTarget === e.target) onFinish();
      }}
    >
      <div className="landing-intro-hero">
        <div className="landing-intro-glow" />
        <img className="landing-intro-mark" src="/clock-growth-logo.svg" alt="" />
      </div>
      <span className="landing-intro-wordmark">
        <span className="wm-chronos">Chronos</span><span className="wm-fin">Fin</span>
      </span>
    </div>
  );
};

export default LandingIntro;
