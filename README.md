<div align="center">

# Linearis

**A token-efficient [Linear.app](https://linear.app) CLI built for AI agents — and humans who like structured data.**

[![NPM version](https://img.shields.io/npm/v/linearis.svg)](https://www.npmjs.com/package/linearis)
[![Node version](https://img.shields.io/node/v/linearis.svg)](https://nodejs.org)
[![CI](https://github.com/linearis-oss/linearis/actions/workflows/ci.yml/badge.svg)](https://github.com/linearis-oss/linearis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![skills.sh](https://skills.sh/b/linearis-oss/linearis)](https://skills.sh/linearis-oss/linearis)

</div>

Linearis is a command-line interface for Linear that speaks **JSON only**. It resolves human-friendly IDs (like `ENG-42` or a team name) to UUIDs for you, and exposes a two-tier `usage` system so an agent can discover exactly the commands it needs without loading the whole API surface into context.

```bash
npm install -g linearis
linearis auth login
linearis issues list --limit 10
```

## Why Linearis?

The official Linear MCP works well, but it costs ~13k tokens just by being connected — before an agent does anything. Linearis takes a different approach: agents discover capabilities on demand through a two-tier usage system.

- `linearis usage` — a compact overview of every domain (~200 tokens).
- `linearis <domain> usage` — the full reference for one domain (~300–500 tokens).

A typical agent interaction costs **~500–700 tokens** of context instead of ~13k. The agent pays only for what it uses, one domain at a time.

> [!NOTE]
> The trade-off is coverage. Linearis focuses on the operations that matter for day-to-day work — issues, discussions, cycles, projects, documents, and files. For custom workflows, integrations, or workspace settings, the MCP is the better choice. See [Coverage](#coverage) for the exact picture.

## Features

- **JSON-only output** — pipe into `jq`, no parsing of tables or prose.
- **Smart ID resolution** — pass `ENG-42`, a team name, or a UUID interchangeably.
- **Two-tier discovery** — self-documenting `usage` commands keep agent context small.
- **Discussion threads** — first-class root/reply modeling on issues.
- **File attachments** — upload and download with signed URLs.
- **Broad domain coverage** — issues, projects, cycles, milestones, initiatives, documents, labels, teams, users, and more.

## Installation

```bash
npm install -g linearis
```

Requires **Node.js ≥ 22**. The `linearis` command is canonical; `linear` is a fully supported alias that runs the same CLI.

## Authentication

The interactive flow opens Linear in your browser, walks you through creating an API key, and stores it encrypted in `~/.linearis/token`:

```bash
linearis auth login
```

Or provide a token directly:

```bash
linearis --api-token <token> issues list        # via flag
LINEAR_API_TOKEN=<token> linearis issues list    # via environment variable
```

Token resolution order: `--api-token` flag → `LINEAR_API_TOKEN` env → `~/.linearis/token` → `~/.linear_api_token` (deprecated).

## Usage

All output is JSON. Start with discovery, then act.

```bash
# Discover what's available (~200 tokens)
linearis usage

# Drill into one domain for its full command reference
linearis issues usage

# List and search
linearis issues list --limit 10
linearis issues search "authentication bug"

# Create an issue
linearis issues create "Fix login flow" --team Platform --priority 2

# Read an issue (includes embeds with signed download URLs)
linearis issues read ENG-42
```

For the complete reference of every command and flag, run `linearis <domain> usage`.

### Discussions

Discussions are modeled as root threads with replies, rather than a flat comment list:

```bash
# Start a discussion thread on an issue
linearis issues discuss ENG-42 --body "Investigating this now"

# List root discussion threads for an issue
linearis issues discussions ENG-42

# List replies in one root thread
linearis issues replies <root-thread-id>

# Reply to a thread (use a root discussion thread ID, not a reply ID)
linearis issues reply <root-thread-id> --body "I found the root cause"
```

### Batch operations

Both batch commands take a JSON document instead of flags, and apply it in a single transaction — either every issue changes or none does. Unknown keys are rejected rather than ignored, so a typo fails the command instead of quietly dropping a field.

`issues batch create` takes an array with one object per issue, keys named after the `issues create` flags:

```json
[
  { "title": "Fix login redirect loop", "team": "ENG", "labels": ["bug"] },
  { "title": "Document the SSO flow", "team": "ENG", "project": "Q3 Auth" }
]
```

`issues batch update` takes the targets plus the one patch they share, keys named after the `issues update` flags, where `null` clears a field:

```json
{
  "issues": ["ENG-42", "ENG-43"],
  "patch": { "status": "In Progress", "assignee": "alice", "cycle": null }
}
```

```bash
linearis issues batch create --file issues.json
linearis issues batch update --file patch.json

# - reads stdin, and --json takes the document inline for one-offs
generate-issues | linearis issues batch create --file -
linearis issues batch update --json '{"issues":["ENG-42"],"patch":{"status":"Done"}}'
```

Both formats are published as JSON Schema (draft 2020-12) in [`schemas/`](schemas/), shipped in the npm package and served raw from the default branch — point a validator or an editor at them to check a document before spending an API call on it.

A schema is the input contract only: it cannot know your team's workflow states, label names, or estimation scale, so a document that validates can still be rejected when a name does not resolve.

## Coverage

Linear's GraphQL API exposes **537 root operations** (164 queries, 373 mutations). Linearis wires **83 of them** directly, plus a number of nested reads — chosen to cover planning and issue work end to end rather than the whole API.

The table below is the honest picture of the whole surface — what works today, and what you'll need the [Linear MCP](#linearis-vs-linear-mcp) or a raw API call for.

**Legend** — ✅ complete for practical purposes · 🟡 core operations, known gaps · 🟠 read-only or narrow slice · 🔴 no CLI surface yet

| Area | Extent | What you can do | Not covered |
|---|---|---|---|
| `auth` | ✅ | Interactive login, token status, logout | — |
| Discussions | ✅ | Root threads and replies on issues, projects, and initiatives; edit, delete, resolve/unresolve; emoji reactions on any of them | Custom workspace emoji management |
| `issues` | ✅ | List, filter, full-text search, read, create, update, batch create/update, archive/unarchive, delete/restore, snooze; assign labels/assignee/delegate/state/priority/project/cycle/team (including moves between teams); subscribe/unsubscribe, share/unshare, reminders; find the issue for a git branch (`from-branch`); relations (list/add/remove); activity history | Deliberately excluded: the AI-assist and integration-suggestion queries (Figma file lookup, filter/repository suggestions, title-from-customer-request) — see the Integrations row — and `issuePriorityValues`, a static list already in the help text |
| `initiatives` | 🟡 | List, read, create, update, archive/unarchive, delete; attach/detach projects; initiative-to-initiative relations; initiative updates (list, read, create, update, archive/unarchive); discussions | Initiative labels, lead-team reassignment, relation reordering |
| `projects` | 🟡 | List, full-text search, read, create, update, delete (trash) and unarchive (restore), disable external sync; assign project labels by name (`--labels`, `--label-mode`, `--clear-labels`); status updates (list, read, create, edit, archive/unarchive, remind); administer the workspace project status flow (`projects statuses`); dependency relations (`projects relations`); discussions; activity timeline | Slack channel creation |
| `documents` | 🟡 | List, read, create, update, delete | Content history, document full-text search, unarchive |
| `milestones` | 🟡 | List, read, create, update (per project) | Delete, reordering/move between projects |
| `attachments` | 🟡 | List on an issue, create from a URL, delete, disable external sync | Update, and the provider-specific link mutations (GitHub PR/issue, GitLab MR, Slack, Jira, Zendesk, Intercom, Front, Salesforce, Discord) |
| `files` | 🟡 | Upload a file, download via signed URL | Delete uploads, image-from-URL, CSV export reports |
| `teams` | 🟡 | List, read, create, update; list/add/remove members | Delete, workflow-state administration, triage responsibility, git automation, SLA configuration |
| `labels` | 🟡 | Issue and project labels alike (`--type issue\|project`): list, read, create, update, delete, retire/restore; label groups (`--group`, `--parent`) | Initiative labels |
| `cycles` | 🟠 | List cycles, read a cycle with its issues | Create, update, archive, shift all, start upcoming cycle |
| `users` | 🟠 | List workspace members | Read a single user, update, role changes, suspend/unsuspend, user settings, session management |
| Integrations | 🔴 | — | All 73 integration root fields (65 mutations, 8 queries): Slack, GitHub, GitLab, Jira, Figma, Sentry, PagerDuty, Intercom, Salesforce, and more |
| Organization & admin | 🔴 | — | Org settings, invites, domains, webhooks, OAuth apps, audit log, SSO |
| Releases | 🔴 | — | Releases, release pipelines, stages, release notes |
| Customers (CRM) | 🔴 | — | Customers, needs, tiers, customer statuses |
| Views & templates | 🔴 | — | Custom views, favorites, templates, view preferences |
| Notifications | 🔴 | — | Inbox, subscriptions, snooze, mark read, push subscriptions |
| Agent sessions | 🔴 | — | Agent sessions, activities, skills, semantic search |
| Roadmaps | 🔴 | — | Roadmaps and roadmap-to-project links |
| Imports & exports | 🔴 | — | Jira/Asana/Clubhouse/GitHub/CSV import jobs |
| Schedules | 🔴 | — | Time schedules and on-call rotations |

The 🔴 rows are mostly workspace administration and integration plumbing — work an agent rarely does mid-task, and the main reason the API-wide coverage number is low while day-to-day coverage is not.

> [!TIP]
> Missing something you need day to day? [Open an issue](https://github.com/linearis-oss/linearis/issues) — the covered set is driven by what people actually reach for, not by API completeness.

## Exit codes

Every failure is JSON on stderr, and the exit code says which class of failure it is:

| Code | Meaning | Payload |
|---|---|---|
| `0` | Success | Result JSON on stdout |
| `1` | Application error — the request was well-formed but could not be fulfilled (entity not found, API rejection) | `{ "error": "<message>" }` |
| `2` | Invalid invocation — unknown command or option, wrong number of arguments, or a command group named without a subcommand | Usage envelope (below) |
| `42` | Authentication required — no usable token, or the stored one is invalid | `{ "error": "AUTHENTICATION_REQUIRED", … }` |

Exit code `2` carries a machine-readable recovery path:

```json
{
  "error": "UNKNOWN_COMMAND",
  "message": "Unknown command \"get\" for \"linearis issues\".",
  "suggestion": "Did you mean read?",
  "command": "linearis issues",
  "available_commands": ["read", "list", "create", "…", "usage"],
  "instruction": "Run 'linearis issues usage' to list valid subcommands.",
  "exit_code": 2
}
```

`error` is one of `UNKNOWN_COMMAND`, `UNKNOWN_OPTION`, `MISSING_ARGUMENT`,
`MISSING_REQUIRED_OPTION`, `MISSING_OPTION_ARGUMENT`, `TOO_MANY_ARGUMENTS`,
`MISSING_SUBCOMMAND`, or `INVALID_USAGE`. `message` is always
a single line. `suggestion` is present only when there is a close-enough near miss,
and `available_commands` only when the failing scope has subcommands to choose from.

Naming a command group without a subcommand (`linearis issues`, `linearis issues
threads`) is a `MISSING_SUBCOMMAND` failure, not a request for help — use
`linearis issues usage` for the machine-readable reference or `linearis issues
--help` for the human one. `linearis` on its own still prints the overview.

## AI agent integration

Linearis is structured around a **discover-then-act** pattern that matches how agents work:

1. **Discover** — `linearis usage` returns a compact overview of all domains. The agent reads it once.
2. **Drill down** — `linearis <domain> usage` gives the full reference for a single domain. The agent loads only what it needs.
3. **Execute** — every command returns structured JSON. No table or prose parsing.

The agent never loads the full API surface into context — it pays for what it uses, one domain at a time.

### Linearis vs. Linear MCP

| | Linearis | Linear MCP |
|---|---|---|
| Context cost | ~500–700 tokens per interaction | ~13k tokens on connect |
| Coverage | Common operations (issues, discussions, cycles, docs, files) | Full Linear API |
| Output | JSON via stdout | Tool-call responses |
| Setup | `npm install -g linearis` + Bash tool | MCP server connection |

Use Linearis when token efficiency matters and you work primarily with issues and related data. Use the MCP when you need full API coverage or tight tool-call integration.

### Agent skill

Linearis ships an agent skill (following the [agentskills.io](https://agentskills.io) standard) so your agent knows how to use it — no prompt to paste. The skill preflights the install, advisory-checks for updates, then follows the discover-then-act protocol above.

**Any harness (recommended)** — Vercel's skills CLI installs into the right place for 70+ agents and lists it on [skills.sh](https://skills.sh):

```bash
npx skills add linearis-oss/linearis
```

**Claude Code** — native plugin:

```
/plugin marketplace add linearis-oss/linearis
/plugin install linearis@linearis
```

**OpenAI Codex** — `npx skills add linearis-oss/linearis` installs to `~/.agents/skills/`; invoke with `/skills` or `$`.

**pi** — `npx skills add linearis-oss/linearis` (or drop `skills/linearis/` into `.pi/skills/`); invoke `/skill:linearis`.

**Google Antigravity** — `npx skills add linearis-oss/linearis` installs to `.agents/skills/`; auto-discovered from the skill list.

## Documentation

- [MIGRATION_2026.4.9.md](MIGRATION_2026.4.9.md) — migrating from the deprecated `comments` domain to discussions (v2026.4.9).
- [`docs/`](docs/) — architecture, development, testing, and build-system references.
- [`schemas/`](schemas/) — JSON Schemas for the commands that take a JSON document ([batch operations](#batch-operations)).
- [`docs/ci-run-model.md`](docs/ci-run-model.md) — the authoritative CI/release trigger matrix.
- [CONTRIBUTING.md](CONTRIBUTING.md) — contributor guidelines.
- [SECURITY.md](SECURITY.md) — how to report security issues.

## Contributors

<a href="https://github.com/linearis-oss/linearis/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=linearis-oss/linearis" alt="Contributors" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## License

[MIT](LICENSE.md)

This project is neither affiliated with nor endorsed by Linear.
