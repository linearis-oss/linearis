# Contributing to Linearis

Thanks for your interest in contributing!

First up, because sadly its necessary: Fascists and brownshirts (US ICE etc.) need not apply. If you like what they do, and/or if you think "your people" are better than "the others", then get fucked, go rage your dick off over on X instead. This here is not a place for you.

**Everyone else:** Welcome! 🖖🏼

## Before You Start

**Bug fixes and small improvements** – PRs welcome! Feel free to dive in.

**Larger features or changes** – Please open an issue first to discuss. This is an opinionated tool, so not every feature fits.

**Questions or problems** – Open a GitHub issue.

## Development Setup

Requires **Node.js >= 22**.

```bash
git clone https://github.com/linearis-oss/linearis.git
cd linearis
npm install        # Install deps, codegen, and lefthook (via prepare hook)
npm start          # Development mode (tsx, no compilation)
npm test           # Run tests
npm run build      # Compile to dist/
npm run check      # Biome format + lint (auto-fix)
npm run generate   # Regenerate GraphQL types from .graphql files
```

**Note:** `npm install` runs GraphQL codegen which fetches the schema from `api.linear.app`. An active internet connection is required for the initial setup.

## Testing

```bash
npm test               # Run all unit tests
npm run test:coverage  # Coverage report
npm run build          # Compile TypeScript (required before integration tests)
```

Integration tests (`tests/integration/`) require `LINEAR_API_TOKEN` in your environment. They are skipped automatically when the token is absent.

## Publishing

Publishing is fully automated by the `Release` workflow (`.github/workflows/release-check.yml`).

- `next` (default branch): releases run on every push (prerelease channel)
- `main` (stable branch): releases run on every push (stable channel)
- Can be started manually with `workflow_dispatch` for either branch
- No scheduled release run is configured
- Release workflow is lean and depends on PR required checks for quality gates
- Uses semantic-release to decide if a release is required
- Publishes npm package, creates tag, and creates GitHub release when releasable commits exist

Required check names for the repository ruleset are documented in [`docs/ci-run-model.md`](docs/ci-run-model.md).

### Changelog ownership

`CHANGELOG.md` is release-workflow-owned. Do not edit it in feature/fix PRs.
If CI reports changelog history violations, rebase on `main` and drop/amend commits that touched `CHANGELOG.md`.

## Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Ensure tests pass (`npm test`)
4. Submit your PR

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description
```

**Types:**

| Type       | Purpose                               |
| ---------- | ------------------------------------- |
| `feat`     | New features                          |
| `fix`      | Bug fixes                             |
| `docs`     | Documentation                         |
| `refactor` | Restructuring without behavior change |
| `style`    | Formatting, whitespace                |
| `perf`     | Performance improvements              |
| `test`     | Adding or fixing tests                |
| `build`    | Build system, dependencies            |
| `chore`    | Maintenance, tooling                  |

**Examples:**

```
fix: resolve null pointer in auth flow
feat(api): add rate limiting endpoint
docs: update README with new commands
```

Use imperative mood ("add" not "added"). Scope is optional.

## Linearis is opinionated, because its maintainer is

I wish times were better and I wouldn't have to mention it, but they aren't and unfortunately, I do:

This tool is made by friendly people for friendly people. We aim to treat eachother with respect and tolerance. [We have zero tolerance for intolerance.](https://medium.com/extra-extra/tolerance-is-not-a-moral-precept-1af7007d6376) This is not open for discussion.

## Architecture & Code Patterns

For architecture details, layer invariants, and code patterns, see [AGENTS.md](AGENTS.md). This is also the file AI coding agents use as context when working on the codebase.
