import { Link } from 'react-router-dom';
import './Landing.css';

const Landing = () => {
  return (
    <div className="landing-page">
      <header className="site-header wrap">
        <Link className="wordmark" to="/" aria-label="ChronosFin home">
          <img src="/chronosfin-logo.svg" alt="ChronosFin" />
        </Link>
        <nav className="nav-links">
          <a className="nav-anchor" href="#how">How it works</a>
          <a className="nav-anchor" href="#philosophy">Why manual</a>
          <a className="nav-anchor" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer">Source</a>
          <Link className="btn btn-ghost" to="/login">Log in</Link>
        </nav>
      </header>

      <main>
        <section className="hero wrap" id="top">
          <div className="hero-copy">
            <p className="eyebrow">Open source · no bank connection · no black box</p>
            <h1>Track your money like you actually understand it.</h1>
            <p className="hero-sub">
              ChronosFin is a manually-kept ledger with goal budgeting and insights you can read the source for. You type the numbers in — nothing else touches your accounts, and no model decides what your spending means.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-primary" to="/register">Start your ledger</Link>
              <a className="btn btn-ghost" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer">View source on GitHub</a>
            </div>
            <p className="hero-note">Free. No credit card. No bank link required.</p>
          </div>

          <div className="ledger" aria-hidden="true">
            <div className="ledger-head">
              <div>
                <div className="label">Checking · Balance</div>
                <div className="balance mono">$4,218.60</div>
              </div>
              <span className="chip">+$2,150.00 this month</span>
            </div>

            <div className="ledger-row">
              <span className="date mono">Aug 6</span>
              <span className="desc"><span className="name">Groceries</span><span className="cat">Food &amp; Dining</span></span>
              <span className="amt neg mono">-$86.40</span>
            </div>
            <div className="ledger-row">
              <span className="date mono">Aug 4</span>
              <span className="desc"><span className="name">Paycheck</span><span className="cat">Income · Salary</span></span>
              <span className="amt pos mono">+$2,150.00</span>
            </div>
            <div className="ledger-row">
              <span className="date mono">Aug 2</span>
              <span className="desc"><span className="name">Electric bill</span><span className="cat">Bills &amp; Utilities</span></span>
              <span className="amt neg mono">-$142.18</span>
            </div>
            <div className="ledger-row">
              <span className="date mono">Jul 30</span>
              <span className="desc"><span className="name">Transfer to Savings</span><span className="cat">Transfer</span></span>
              <span className="amt neg mono">-$400.00</span>
            </div>

            <div className="ledger-goal">
              <div className="ledger-goal-top">
                <span className="gname">Emergency Fund</span>
                <span className="gpct mono">62%</span>
              </div>
              <div className="ledger-goal-bar"><span></span></div>
              <div className="ledger-goal-foot mono">$3,720 of $6,000 · on pace</div>
            </div>
          </div>
        </section>

        <hr className="rule" />

        <section className="wrap">
          <div className="section-head">
            <p className="eyebrow">What it does</p>
            <h2>Four things, done plainly.</h2>
            <p>No dashboards trying to be clever. Just the parts of managing money that actually matter.</p>
          </div>

          <div className="feature-grid">
            <div className="feature">
              <span className="tag">Accounts</span>
              <h3>Every account, one place</h3>
              <p>Checking, savings, credit, investment — track balances side by side without connecting anything.</p>
            </div>
            <div className="feature">
              <span className="tag">Transactions</span>
              <h3>Log it as it happens</h3>
              <p>Income, expenses, transfers between your own accounts. Filter by category, date range, or amount whenever you need to find something.</p>
            </div>
            <div className="feature">
              <span className="tag">Goals</span>
              <h3>A target and a date</h3>
              <p>Set what you're saving for, contribute as you go, and see whether your pace actually gets you there in time.</p>
            </div>
            <div className="feature">
              <span className="tag">Insights</span>
              <h3>Five checks, run on your data</h3>
              <p>Spending-category alerts, savings opportunities, budget recommendations, goal pace, unusual activity — each one a rule, not a guess.</p>
            </div>
          </div>
        </section>

        <section className="philosophy" id="philosophy">
          <div className="wrap philosophy-grid">
            <blockquote>&ldquo;Every insight traces back to a rule you could read yourself.&rdquo;</blockquote>
            <div className="philosophy-detail">
              <p>Most finance apps ask you to link your bank and hand your transaction history to a model you can't inspect. ChronosFin asks you to do the typing instead — and in exchange, nothing about what it tells you is a guess.</p>
              <p>
                When it flags that your dining spend jumped 32% this month, that's five lines of comparison logic, not a prediction. When it says you're behind pace on a goal, that's arithmetic against your own target date. You can read exactly how —{' '}
                <a className="inline-link" href="https://github.com/myst9811/ChronosFin/blob/main/backend/src/services/insight.service.ts" target="_blank" rel="noopener noreferrer">the insight logic is right here</a>.
              </p>
            </div>
          </div>
        </section>

        <section className="wrap" id="how">
          <div className="section-head">
            <p className="eyebrow">How it works</p>
            <h2>Three steps, in order.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <span className="num mono">01</span>
              <h3>Add your accounts</h3>
              <p>Checking, savings, whatever you're actually tracking. Takes a minute, no institution login required.</p>
            </div>
            <div className="step">
              <span className="num mono">02</span>
              <h3>Log transactions</h3>
              <p>As they happen, or backfill your recent history. Categorize once and filter by it forever.</p>
            </div>
            <div className="step">
              <span className="num mono">03</span>
              <h3>Get insights</h3>
              <p>Five rule-based checks run automatically against real patterns in what you've logged — no setup needed.</p>
            </div>
          </div>
        </section>

        <section className="wrap">
          <div className="oss">
            <div>
              <h2>MIT licensed. Read it, run it, change it.</h2>
              <p>The whole thing — API, database schema, insight rules, this page — is public. Self-host it, fork it, or just check the code does what this page says it does.</p>
              <p className="stack-line">Built with <span className="mono">React</span> · <span className="mono">Express</span> · <span className="mono">PostgreSQL</span> · <span className="mono">Prisma</span></p>
            </div>
            <div className="oss-actions">
              <a className="btn btn-primary" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer">Browse the repository</a>
              <a className="btn btn-ghost" href="https://github.com/myst9811/ChronosFin/blob/main/docs/API.md" target="_blank" rel="noopener noreferrer">Read the API docs</a>
            </div>
          </div>
        </section>

        <section className="final-cta wrap">
          <p className="eyebrow">Get started</p>
          <h2>Start your ledger.</h2>
          <p>Two minutes to your first account. No bank link, no card on file, nothing to connect.</p>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/register">Create a free account</Link>
          </div>
        </section>
      </main>

      <footer className="wrap">
        <span>ChronosFin — an open-source personal finance ledger.</span>
        <span className="footer-links">
          <a href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer">GitHub</a>
          <Link to="/login">Log in</Link>
        </span>
      </footer>
    </div>
  );
};

export default Landing;
