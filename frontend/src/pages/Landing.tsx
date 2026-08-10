import { Link } from 'react-router-dom';
import AnimatedLogoMark from '../components/landing/AnimatedLogoMark';
import GithubIcon from '../components/landing/GithubIcon';
import { mockTransactions, mockGoals, mockAccounts } from '../data/mockData';
import './Landing.css';

// Deliberately independent of utils/formatters.ts's formatCurrency (which
// defaults to INR for the real, logged-in app) -- this hero mockup is
// decorative marketing content styled in USD regardless of the app's
// actual default currency.
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function shortDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const Landing = () => {
  const checkingAccount = mockAccounts.find((a) => a.type === 'checking') ?? mockAccounts[0];
  const monthlyIncome = mockTransactions
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const ledgerTransactions = mockTransactions.slice(0, 4);
  const ledgerGoal = mockGoals.find((g) => g.name === 'Emergency Fund') ?? mockGoals[0];
  const ledgerGoalPct = Math.round((ledgerGoal.currentAmount / ledgerGoal.targetAmount) * 100);

  return (
    <div className="landing-page">
      <header className="site-header wrap">
        <Link className="wordmark" to="/" aria-label="ChronosFin home">
          <AnimatedLogoMark />
        </Link>
        <nav className="nav-links">
          <a className="nav-anchor" href="#how">How it works</a>
          <a className="nav-anchor" href="#philosophy">Why manual</a>
          <a className="nav-anchor" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer"><GithubIcon /> Source</a>
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
              <a className="btn btn-ghost" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer"><GithubIcon /> View source on GitHub</a>
            </div>
            <p className="hero-note">Free. No credit card. No bank link required.</p>
          </div>

          <div className="ledger" aria-hidden="true">
            <div className="ledger-head">
              <div>
                <div className="label">Checking · Balance</div>
                <div className="balance mono">{usdFormatter.format(checkingAccount.balance)}</div>
              </div>
              <span className="chip">+{usdFormatter.format(monthlyIncome)} this month</span>
            </div>

            {ledgerTransactions.map((transaction) => (
              <div className="ledger-row" key={transaction.id}>
                <span className="date mono">{shortDate(transaction.date)}</span>
                <span className="desc">
                  <span className="name">{transaction.description}</span>
                  <span className="cat">{transaction.category}</span>
                </span>
                <span className={`amt ${transaction.amount < 0 ? 'neg' : 'pos'} mono`}>
                  {transaction.amount < 0 ? '-' : '+'}
                  {usdFormatter.format(Math.abs(transaction.amount))}
                </span>
              </div>
            ))}

            <div className="ledger-goal">
              <div className="ledger-goal-top">
                <span className="gname">{ledgerGoal.name}</span>
                <span className="gpct mono">{ledgerGoalPct}%</span>
              </div>
              <div className="ledger-goal-bar"><span style={{ width: `${ledgerGoalPct}%` }}></span></div>
              <div className="ledger-goal-foot mono">
                {usdFormatter.format(ledgerGoal.currentAmount)} of {usdFormatter.format(ledgerGoal.targetAmount)} · on pace
              </div>
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
              <a className="btn btn-primary" href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer"><GithubIcon /> Browse the repository</a>
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
          <a href="https://github.com/myst9811/ChronosFin" target="_blank" rel="noopener noreferrer"><GithubIcon /> GitHub</a>
          <Link to="/login">Log in</Link>
        </span>
      </footer>
    </div>
  );
};

export default Landing;
