# Contributing

## Getting set up

Follow [docs/SETUP.md](docs/SETUP.md) to get the backend and frontend running locally, then confirm your environment with:

```bash
npm run build:backend
npm run build:frontend
npm run lint:frontend
npm run test:backend
```

All four should pass before you start making changes, and again before opening a PR.

## Before opening a PR

- Keep PRs focused — one logical change per PR, matching the commit history's existing style of small, scoped commits.
- Backend changes: add or update tests under the relevant `__tests__/` directory. Tests run against a real Postgres database, not mocks — see the "Running backend tests" section of [SETUP.md](docs/SETUP.md).
- If you're touching architecture, adding a dependency, or making a non-obvious design decision, a short spec in `docs/superpowers/specs/` explaining the reasoning is welcome (not required) — see existing ones there for the format.
- Note in your PR description whether you ran the verification commands above locally. CI exists (`.github/workflows/ci.yml`) but may not be actively gating PRs — check `docs/PRODUCTION_READINESS.md` for current status before assuming a green check means anything.

## Code style

No enforced formatter beyond ESLint on the frontend (`npm run lint:frontend`). Match the conventions already in the file you're editing — this codebase deliberately avoids some common defaults (no schema-validation library like zod, no ORM abstraction beyond Prisma itself, hand-written validators in `backend/src/utils/validation.ts`) in favor of staying dependency-light; new code should follow that same instinct rather than introducing a new library for something a few lines of plain code can do.

## Reporting bugs / requesting features

Open a GitHub issue. Include repro steps for bugs.
