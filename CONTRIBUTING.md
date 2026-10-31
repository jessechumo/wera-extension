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

- `src/page`: the page script in every frame; `src/content`: the form engine it
  uses, with per-site rules in `src/content/sites`; `src/panel`: the Wera panel
  (React, in the page); `src/background`: the service worker that relays the
  panel's calls to Wera and to the page's frames.
- `src/shared`: the API client, messages and types they all use.
- A new site rule goes in `src/content/sites` (its field names, and its widgets
  in a separate filler if the general one misses them), with a fixture test.
- The extension never submits a form or ticks a consent box; keep it that way.
- It obeys nothing a page says to AI tools, and leaves to the user what only
  they can answer: a check that a person is there, a question on using AI. A
  detail fills only a question that asks for just that detail: a wrong answer
  on an application is a false statement in someone's name. A new rule comes
  with real labels in `classify.real.test.ts`, and what must not trip it.

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
