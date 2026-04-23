## [2026.4.8-next.3](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.2...v2026.4.8-next.3) (2026-04-23)

### Bug Fixes

* **ci:** escape markdown backticks in promotion PR body ([21d31c7](https://github.com/linearis-oss/linearis/commit/21d31c7b82711d62524645af602e4387dbf82356))

## [2026.4.8-next.2](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.1...v2026.4.8-next.2) (2026-04-23)

### Bug Fixes

* **ci:** address review feedback for release and history guards ([db27e14](https://github.com/linearis-oss/linearis/commit/db27e148bc95acb610e8dea6471e14896e13be26))

## [2026.4.8-next.1](https://github.com/linearis-oss/linearis/compare/v2026.4.7...v2026.4.8-next.1) (2026-04-23)

### Bug Fixes

* abort timed-out GraphQL requests ([332da1e](https://github.com/linearis-oss/linearis/commit/332da1efd6c86a299ea5639b561bc8383013740c))
* **ci:** migrate release automation to GitHub App auth ([f0ba4e0](https://github.com/linearis-oss/linearis/commit/f0ba4e0c0a200b70ffa68c367ebce7829b1d29e4))
* **ci:** use deploy key for release automation git pushes ([5b42037](https://github.com/linearis-oss/linearis/commit/5b42037911b1cf44bfa71757326ecbeceee6d2a1))
* clear graphql timeout timers on all request paths ([1de7887](https://github.com/linearis-oss/linearis/commit/1de78871d52f106d9b7956f6eaa908f14395653b))
* **release:** keep prerelease train on stable patch ([0964e75](https://github.com/linearis-oss/linearis/commit/0964e75113d6dbee13e2da5487c9ec08733334fc))

# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2026.4.7] - 2026-04-22

[2026.4.7]: https://github.com/linearis-oss/linearis/compare/v2026.4.6...v2026.4.7

### Fixed

- Process now exits immediately after command completion to prevent hanging runs in automation workflows — thanks, [@eveld](https://github.com/eveld)! [PR#156](https://github.com/linearis-oss/linearis/pull/156)

---

## [2026.4.6] - 2026-04-21

[2026.4.6]: https://github.com/linearis-oss/linearis/compare/v2026.4.5...v2026.4.6

### Fixed

- enforce strict team-scale estimate validation for `issues create --estimate` and `issues update --estimate`, including hard fail when team estimates are disabled (`notUsed`)

---

## [2026.4.5] - 2026-04-19

[2026.4.5]: https://github.com/linearis-oss/linearis/compare/v2026.4.4...v2026.4.5

### Added

- **Initiatives domain support** — new `initiatives` command group with typed GraphQL operations, service layer CRUD/relation/project-link flows, resolver ID translation, and CLI usage metadata wiring
- **Issue attachments management** — new `attachments` command group (`list`, `create`, `delete`) and `issues read --with-attachments` for embedded issue attachment expansion [#55](https://github.com/linearis-oss/linearis/issues/55)
- **Reusable numeric option parsing** — shared integer parsers for issue CLI flags to standardize validation and option handling
- **Retry backoff for transient API failures** — exponential retry delays for retryable HTTP/GraphQL failures

### Fixed

- Initiatives GraphQL operations now align with current schema shape and pagination behavior for relation/link lookups
- Initiative command surface corrected for sorting and update/create signatures to match implementation constraints
- Issue create/update now validate `--priority` and `--estimate` values early before resolver/service calls
- Retry middleware now wraps only raw HTTP transport so retry classification inspects original status codes
- Auth error handling now discriminates empty catch paths explicitly for safer failure reporting

### CI & Build

- Added CI guard preventing accidental `docs/plans/*.md` history in PR branches
- Updated runtime dependency `@linear/sdk` to v81 and refreshed non-major dev dependencies

### Testing

- Expanded issue numeric validation test coverage and retry backoff timer coverage
- Added failing/coverage tests for multi-relation and initiative service/update flows

---

## [2026.4.4] - 2026-04-09

[2026.4.4]: https://github.com/linearis-oss/linearis/compare/v2026.4.3...v2026.4.4

### Changed

- Restored the dedicated `issues search <query>` subcommand while keeping `issues list --query <query>` as a deprecated compatibility path for one release window; both commands now share the same filter flags [#121](https://github.com/linearis-oss/linearis/issues/121), [PR#124](https://github.com/linearis-oss/linearis/pull/124)

### CI & Build

- Switched the publish workflow from `npm install` to `npm ci` for reproducible clean installs in CI [PR#122](https://github.com/linearis-oss/linearis/pull/122)

---

## [2026.4.3] - 2026-04-08

[2026.4.3]: https://github.com/linearis-oss/linearis/compare/v2026.4.2...v2026.4.3

### Added

- **Estimate support** — `--estimate` on `issues create`, and `--estimate`/`--clear-estimate` on `issues update` with scale-neutral descriptions and `--estimate 0` support [PR#94](https://github.com/linearis-oss/linearis/pull/94)

### Fixed

- Replaced `postinstall` with `prepare` to fix broken consumer installs via `npm install -g linearis` [#120](https://github.com/linearis-oss/linearis/issues/120), [PR#123](https://github.com/linearis-oss/linearis/pull/123)

### CI & Build

- Added `clean-publish` to strip dev artifacts from published tarball [PR#123](https://github.com/linearis-oss/linearis/pull/123)
- Added smoke test for consumer package install [PR#123](https://github.com/linearis-oss/linearis/pull/123)

### Documentation

- Updated contributing guide with publishing section and lifecycle hook policy [PR#123](https://github.com/linearis-oss/linearis/pull/123)

---

## [2026.4.2] - 2026-04-08

[2026.4.2]: https://github.com/linearis-oss/linearis/compare/v2026.4.1...v2026.4.2

### Added

- **Due date support** — `--due-date` option on `issues create`, and `--due-date`/`--clear-due-date` on `issues update` [PR#119](https://github.com/linearis-oss/linearis/pull/119)
- **Project CRUD commands** — new `project read`, `project create`, and `project update` commands with label and status ID resolution [PR#118](https://github.com/linearis-oss/linearis/pull/118)
- **Comment management** — new `comments list`, `comments reply`, `comments edit`, and `comments delete` subcommands [PR#81](https://github.com/linearis-oss/linearis/pull/81)
- **XDG_CONFIG_HOME support** — token storage now respects `XDG_CONFIG_HOME` on Linux [#73](https://github.com/linearis-oss/linearis/issues/73)
- **GitHub release automation** — publish workflow now creates GitHub releases automatically [PR#77](https://github.com/linearis-oss/linearis/pull/77)

### Fixed

- Migrated `moduleResolution` from `Node` to `Bundler` for TypeScript 6 compatibility [PR#107](https://github.com/linearis-oss/linearis/pull/107)
- Added `prepack` script for git-based installs [PR#80](https://github.com/linearis-oss/linearis/pull/80)
- Updated `@linear/sdk` to v80 [PR#109](https://github.com/linearis-oss/linearis/pull/109)
- Updated `commander` to v14.0.3 [PR#103](https://github.com/linearis-oss/linearis/pull/103)

### Changed

- Standardized delete return types to `{id, success}` across all delete operations [PR#86](https://github.com/linearis-oss/linearis/pull/86)

### CI & Build

- Expanded CI matrix to test Node.js 22 and 24 [PR#112](https://github.com/linearis-oss/linearis/pull/112)
- Pinned publish workflow to minimum supported Node version [PR#113](https://github.com/linearis-oss/linearis/pull/113)
- Aligned action versions to v6 across CI and publish workflows [PR#92](https://github.com/linearis-oss/linearis/pull/92)
- Added content permission to CI workflow [PR#99](https://github.com/linearis-oss/linearis/pull/99)
- Added CODEOWNERS file for security review gates

### Maintenance

- Updated TypeScript to v6, Vitest to v4, `@types/node` to v24
- Updated dev dependencies (non-major)
- Disabled Renovate dependency dashboard
- Updated `.gitignore` to exclude generated files
- Removed obsolete mise config and tasks

### Documentation

- Replaced manual contributor list with contrib.rocks [PR#102](https://github.com/linearis-oss/linearis/pull/102)

---

## [2026.4.1] - 2026-04-07

[2026.4.1]: https://github.com/linearis-oss/linearis/compare/v2025.12.3...v2026.4.1

### Breaking Changes

- **Complete architecture rewrite** to a strict five-layer architecture: CLI Input → Command → Resolver → Service → JSON Output. [#45](https://github.com/linearis-oss/linearis/issues/45), [#27](https://github.com/linearis-oss/linearis/issues/27), [#43](https://github.com/linearis-oss/linearis/issues/43), [#47](https://github.com/linearis-oss/linearis/issues/47), [PR#49](https://github.com/linearis-oss/linearis/pull/49)
- **`embeds` commands renamed to `files`** — `embeds download` → `files download`, `embeds upload` → `files upload`
- **`project-milestones` commands renamed to `milestones`**
- **`search` subcommands merged into `list`** — use `issues list --status ...` instead of `issues search --status ...`

### Added

- **Encrypted token authentication** — `linearis auth login` opens Linear in the browser and stores the token encrypted in `~/.linearis/token`. New subcommands: `auth login`, `auth status`, `auth logout`
- **Issue relation flags** — `--blocks`, `--blocked-by`, `--relates-to` on issue update
- **Cursor pagination** — `--after` and `--limit` flags on all list commands
- **Assignee resolution** — `--assignee` flag resolves by name or email
- **`usage` subcommand** on every command group for self-documenting CLI help
- **Request timeouts** — GraphQL API requests time out after 30 seconds, file download/upload after 60 seconds. Prevents indefinite hangs, especially important for LLM agent tool timeouts
- **GraphQL Code Generator pipeline** — queries and mutations defined in `.graphql` files under `graphql/`, codegen produces typed DocumentNodes
- **Biome** for formatting and linting (replaces previous setup)
- **Lefthook** git hooks with **commitlint** for conventional commit enforcement
- **Security policy** (`SECURITY.md`) with responsible disclosure process
- **GitHub community templates** — bug report form, feature request form, PR template

### Fixed

- File download and upload commands now use proper error exit codes (exit 1) on failure instead of returning exit code 0 with a success envelope

### Documentation

- Complete documentation rewrite for v2 architecture
- New docs: `architecture.md`, `development.md`, `testing.md`, `build-system.md` with layer invariants, mock patterns, and service/resolver/command templates
- `AGENTS.md` restructured for machine-first readability with decision trees and anti-patterns
- `README.md` rewritten for current CLI commands and agent optimization
- `CONTRIBUTING.md` expanded with dev setup, testing, and architecture pointer
- Removed obsolete 26k-line GraphQL schema dump and completed implementation plans

---

## [2025.12.3] - 2025-12-11

[2025.12.3]: https://github.com/czottmann/linearis/compare/v2025.12.2...v2025.12.3

### Fixed

- Version string now read from `package.json` instead of being hardcoded

---

## [2025.12.2] - 2025-12-11

[2025.12.2]: https://github.com/czottmann/linearis/compare/v2025.11.3...v2025.12.2

### Added

- New `embeds upload` command to upload files to Linear storage – thanks, [@chadrwalters](https://github.com/chadrwalters)! [PR#23](https://github.com/czottmann/linearis/pull/23)
- New `documents` commands for Linear document management – thanks, [@ralfschimmel](https://github.com/ralfschimmel)! [PR#21](https://github.com/czottmann/linearis/pull/21)
- `issues` commands now include the `branchName` field (the git branch name associated with the issue). [#14](https://github.com/czottmann/linearis/issues/14) <!-- ZCO-1629 -->
- Diagnostic output for issue transform errors, showing raw API response and stack trace to help debug null field issues. [#6](https://github.com/czottmann/linearis/issues/6) <!-- ZCO-1630 -->

### Breaking Changes

- **Issue "status" flag renamed**: `--state`/`--states` options renamed to `--status` for consistency with Linear's UI terminology. Thanks for the (appreciated but ultimately unused) PR, [@ralfschimmel](https://github.com/ralfschimmel)! <!-- ZCO-1641 -->
  - `issues search --states` → `--status` (still accepts comma-separated values)
  - `issues update --state` → `--status` (short flag `-s` unchanged)

### Tooling

- Prepublish validation to ensure `dist/main.js` exists and is executable before publishing to npm <!-- ZCO-1604 -->
- Cleaned up the tiny `pnpm` vs `npm` mess, it's now `npm` all the things <!-- ZCO-1603 -->

---

## [2025.11.3] - 2025-11-20

[2025.11.3]: https://github.com/czottmann/linearis/compare/2025.11.2...v2025.11.3

### Added

- New `teams` command with `list` subcommand 🎉 – thanks, [@chadrwalters](https://github.com/chadrwalters)! [PR#13](https://github.com/czottmann/linearis/pull/13)
  - Lists all teams in workspace with id, key, name, and description
  - Results sorted alphabetically by name
- New `users` command with `list` subcommand [PR#13](https://github.com/czottmann/linearis/pull/13)
  - Lists all users with id, name, displayName, email, and active status
  - Supports `--active` flag to filter for active users only
  - Results sorted alphabetically by name
- Integration tests for teams and users commands [PR#13](https://github.com/czottmann/linearis/pull/13)

### Fixed

- GraphQL orderBy error resolved by implementing client-side sorting for teams and users list commands [PR#13](https://github.com/czottmann/linearis/pull/13)
- Project name matching is now case-insensitive (using `eqIgnoreCase`) for better UX [PR#13](https://github.com/czottmann/linearis/pull/13)

### Documentation

- Added "Teams & Users" section to README.md with usage examples
- Updated docs/architecture.md, docs/development.md, and docs/files.md to reference new commands

---

## [2025.11.2] - 2025-11-11

[2025.11.2]: https://github.com/czottmann/linearis/compare/2025.11.1...2025.11.2

### Added

- New `cycles` and `project-milestones` commands 🎉 – thanks, [Ryan](https://github.com/ryanrozich)! [PR#7](https://github.com/czottmann/linearis/pull/7)
- The `issues` commands now include parent and child issue relationships <!-- ZCO-1574, ZCO-1586 -->
  - `parentIssue` field with `{ id, identifier, title }` for parent issue (if exists)
  - `subIssues` array with `{ id, identifier, title }` for immediate child issues
  - Available in all issue commands: `read`, `list`, and `search`

### Fixed

- `issues` commands' embed parser now correctly ignores markdown URLs inside code blocks and inline code <!-- ZCO-1587 -->
  - Previously extracted URLs from code examples and documentation
  - Ensures only actual embedded files are detected, not code examples
- All date/time fields now output in ISO 8601 format (`2025-11-09T23:00:00.000Z`) instead of verbose JavaScript date strings <!-- ZCO-1577 -->
- Under-the-hood stability bug fixes.

---

## [2025.11.1] - 2025-11-06

[2025.11.1]: https://github.com/czottmann/linearis/compare/1.1.0...2025.11.1

### Added

- `issues` commands' results now include `embeds` array containing tickets' file embeds
  - Embed extraction from issue descriptions and comments
    - Parses markdown for Linear upload URLs (`![label](url)` and `[label](url)`)
    - Returns `embeds` array in `issues read` command output
    - Each embed includes `label`, `url`, and `expiresAt` (ISO 8601 timestamp)
- New `embeds` command group for downloading embedded files from Linear's cloud storage
  - `embeds download <url>` command to download files
    - `--output <path>` option for custom output location
    - `--overwrite` flag to replace existing files
    - Automatic directory creation for output paths

### Documentation

- Renamed CLAUDE.md to AGENTS.md, re-added CLAUDE.md as a symlink
- Updated AGENTS.md with file download features and signed URL documentation
- Added File Downloads section to README.md with usage examples
- Updated docs/files.md with new command and utility files
- Added embeds command flow and extraction flow diagrams to documentation

---

## [1.1.0] - 2025-10-21

[1.1.0]: https://github.com/czottmann/linearis/compare/1.0.0...1.1.0

### Fixes

- Updated CLI program name from "linear" to "linearis" for consistency with project name

### Documentation

- Added section "Example rule for your LLM agent of choice" to README

---

## [1.0.0] - 2025-10-21

[1.0.0]: https://github.com/czottmann/linearis/releases/tag/1.0.0

### Added

- Initial release of Linearis CLI tool
