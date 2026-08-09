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
      <img className="landing-intro-mark lm-wrap" src="/clock-growth-logo.svg" alt="" />
      <span className="landing-intro-wordmark">
        <span className="wm-chronos">Chronos</span><span className="wm-fin">Fin</span>
      </span>
    </div>
  );
};

export default LandingIntro;
