# Contributing to Wera for Chrome

## Setup

Requirements: Node 26 (what CI and the Docker image use) and a running Wera API.

```sh
npm ci
npm run dev         # rebuilds dist/ on change; load it unpacked in Chrome
```

## Checks before a pull request

```sh
npm run lint        # ESLint with type-aware rules, zero warnings
npm run typecheck
npm test            # Vitest; npm run coverage for the CI threshold
npm run e2e         # the real extension in Chromium against a Wera API
```

## Layout

- `src/sidepanel`: the React side panel; `src/content`: the content script
  that reads and fills pages; `src/background`: the service worker.
- `src/shared`: the API client and types used by all three.
- The extension never submits a form or ticks a consent box; keep it that way.

## Branches and pull requests

- Work on a branch from `dev` (or on `dev` itself for small changes) and open
  a pull request into `main`. CI must pass before merging.
- Keep commits small and focused: one logical change each.
- Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org):
  `type(scope): subject`, lowercase and imperative, no trailing period, e.g.
  `feat(tracker): drag jobs between columns` or `fix(api): refuse expired tokens`.
  Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`.
  The body says why. A pull request check enforces the format.
- Releases are automatic: release-please reads the commits on `main` and keeps
  a release pull request with the next version and the changelog. Merging it
  cuts the release.

## Code style

- Write code that reads like the code around it: same naming, same comment
  density, same idioms.
- Comments explain why, not what. Exported names get a doc comment.
- Every lint exception names its rule and says why.
- New behavior comes with tests; bugs get a test that fails before the fix.

## Diagrams

The architecture diagrams are Excalidraw files; see `docs/diagrams/README.md`.
