# CI Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that builds/lints the frontend and builds/tests the backend (against a real Postgres service container) on every push and PR to `main`, then protect `main` so PRs can't merge unless both checks pass.

**Architecture:** One workflow file, `.github/workflows/ci.yml`, with two independent parallel jobs (`frontend`, `backend`). No shared reusable-workflow abstraction — the two jobs are different enough (Postgres service container + Prisma migrations vs. plain lint/build) that a shared/matrix structure would add indirection without saving real duplication. Full rationale in `docs/superpowers/specs/2026-08-06-ci-pipeline-design.md`.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), a `postgres:16-alpine` service container, `gh` CLI (already authenticated in this environment) for the PR and branch-protection steps.

---

### Task 1: Author the CI workflow file

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create a feature branch**

Follow this repo's existing convention (see `git log`, e.g. `feature/frontend-goals-page`) rather than committing to `main` directly — this workflow can only be fully validated by a real GitHub Actions run, which needs a pushed branch/PR anyway.

Run: `git checkout -b feature/ci-pipeline`
Expected: `Switched to a new branch 'feature/ci-pipeline'`

- [ ] **Step 2: Create the workflow file**

Run: `mkdir -p .github/workflows`

Then create `.github/workflows/ci.yml` with exactly this content:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build

  backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: financeflow
          POSTGRES_PASSWORD: financeflow
          POSTGRES_DB: financeflow
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U financeflow -d financeflow"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://financeflow:financeflow@localhost:5432/financeflow?schema=public
      DIRECT_URL: postgresql://financeflow:financeflow@localhost:5432/financeflow?schema=public
      JWT_SECRET: ci-test-secret-do-not-use-in-production
      PORT: 3001
      CORS_ORIGIN: http://localhost:5173
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Apply database migrations
        run: npx prisma migrate deploy

      - name: Build
        run: npm run build

      - name: Test
        run: npm test
```

Note: jobs are intentionally left without a custom `name:` field, so GitHub displays each check using its job id (`frontend`, `backend`) — this is what Task 3's branch-protection `contexts` list references.

- [ ] **Step 3: Sanity-check the file**

There's no YAML linter installed in this environment (`actionlint`/`yamllint`/PyYAML all absent — confirmed during planning), so do a manual structural check instead of a tool-based one:

Run: `grep -c "^  [a-z]*:$" .github/workflows/ci.yml`
Expected: at least `2` (the `frontend:` and `backend:` job keys), confirming the file parses as intended at a glance. This is a smoke check only — Task 2's real GitHub Actions run is the actual test.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "Add CI workflow: frontend lint/build, backend build/test"
```

---

### Task 2: Push, open a PR, and get the workflow green

**Files:** none (this task only runs commands)

- [ ] **Step 1: Push the branch**

Run: `git push -u origin feature/ci-pipeline`
Expected: branch pushed, GitHub prints a "Create a pull request" hint URL.

- [ ] **Step 2: Open the PR**

```bash
gh pr create \
  --title "Add CI pipeline (build, lint, test gate)" \
  --body "$(cat <<'EOF'
## Summary
- Adds .github/workflows/ci.yml: frontend job (lint + build) and backend job (build + test against a real Postgres service container)
- First item from docs/PRODUCTION_READINESS.md's production-readiness push
- Design: docs/superpowers/specs/2026-08-06-ci-pipeline-design.md

## Test plan
- [ ] Confirm both `frontend` and `backend` checks appear on this PR and go green
EOF
)"
```

Expected: PR URL printed, e.g. `https://github.com/myst9811/FinanceFlow/pull/<N>`.

- [ ] **Step 3: Watch the checks run**

Run: `gh pr checks --watch`
Expected: eventually both `frontend` and `backend` report `pass`. This can take a few minutes (Postgres service container startup + `npm ci` + migrations + build + test for the backend job).

- [ ] **Step 4: If a check fails, diagnose and fix**

This step is a loop, not a fixed action — repeat until Step 3 shows both checks passing:

1. Run: `gh run list --branch feature/ci-pipeline --limit 1` to get the run ID.
2. Run: `gh run view <run-id> --log-failed` to see exactly which step failed and why.
3. Fix `.github/workflows/ci.yml` (or, if the failure is a genuine app bug the local build/test steps never caught, fix the app code) based on the log output.
4. Commit the fix: `git add -A && git commit -m "Fix CI: <specific reason>"` (keep this commit focused on the one fix — don't bundle multiple unrelated corrections).
5. Run: `git push`
6. Go back to Step 3 (`gh pr checks --watch`).

Do not guess at fixes without reading the actual failure log — the two most likely first-run failures, per the design spec's risk analysis, are a typo in the Postgres health-check flags or a missing `working-directory` default, both of which produce distinctive, easy-to-read errors in the step log.

---

### Task 3: Protect `main` on both checks

**Files:** none (this task only runs commands; it changes a GitHub repository setting, not repo content)

- [ ] **Step 1: Confirm no existing protection rule would be silently overwritten**

Run: `gh api repos/myst9811/FinanceFlow/branches/main/protection`
Expected: `404` with `"message": "Branch not protected"` (this was already confirmed during the design phase — re-confirm here in case anything changed since).

- [ ] **Step 2: Apply the protection rule**

The branch protection endpoint requires a full JSON body — partial bodies are rejected — so this uses `--input` with a heredoc rather than individual `-f` flags:

```bash
gh api \
  --method PUT \
  repos/myst9811/FinanceFlow/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["backend", "frontend"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

Expected: `200` response echoing back the protection config, including `"contexts": ["backend", "frontend"]`.

- [ ] **Step 3: Verify**

Run: `gh api repos/myst9811/FinanceFlow/branches/main/protection --jq '.required_status_checks.contexts'`
Expected: `["backend","frontend"]`

---

### Task 4: Merge

**Files:** none

- [ ] **Step 1: Merge the PR**

Use a merge commit, matching this repo's existing history (`git log` shows `Merge pull request #N from myst9811/feature/...` for every prior feature branch):

Run: `gh pr merge --merge --delete-branch`
Expected: PR merges, remote `feature/ci-pipeline` branch is deleted, output confirms merge.

- [ ] **Step 2: Confirm the protection is live against real PRs going forward**

Run: `gh pr view --json state,mergeStateStatus` is not meaningful post-merge — instead confirm structurally:

Run: `gh api repos/myst9811/FinanceFlow/branches/main/protection/required_status_checks --jq '.contexts'`
Expected: `["backend","frontend"]`, confirming the rule persisted after the merge (branch protection is a setting on `main` itself, unaffected by merging a PR into it, but worth the one-line confirmation since this is the last step of the whole plan).

- [ ] **Step 3: Sync local `main`**

```bash
git checkout main
git pull
```

Expected: local `main` now has the CI workflow commit(s), fast-forwarded from origin.
