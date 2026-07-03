<div align="center">

# Linearis

**A token-efficient [Linear.app](https://linear.app) CLI built for AI agents — and humans who like structured data.**

[![NPM version](https://img.shields.io/npm/v/linearis.svg)](https://www.npmjs.com/package/linearis)
[![Node version](https://img.shields.io/node/v/linearis.svg)](https://nodejs.org)
[![CI](https://github.com/linearis-oss/linearis/actions/workflows/ci.yml/badge.svg)](https://github.com/linearis-oss/linearis/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)

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
> The trade-off is coverage. Linearis focuses on the operations that matter for day-to-day work — issues, discussions, cycles, projects, documents, and files. For custom workflows, integrations, or workspace settings, the MCP is the better choice.

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

### Domains

| Domain | What it covers |
|---|---|
| `issues` | Work items with status, priority, assignee, labels, and discussions |
| `projects` | Groups of issues working toward a goal |
| `initiatives` | Strategic, multi-project goals |
| `cycles` | Time-boxed iterations (sprints) per team |
| `milestones` | Progress checkpoints within projects |
| `documents` | Long-form markdown docs attached to projects or issues |
| `labels` | Categorization tags for issues and projects |
| `attachments` | Linked external resources on issues (PRs, commits, URLs) |
| `files` | Upload and download file attachments |
| `teams` | Organizational units owning issues and cycles |
| `users` | Workspace members and assignees |
| `auth` | Authenticate with the Linear API |

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

### Example agent prompt

Add this (or a version adapted to your workflow) to your `AGENTS.md` or `CLAUDE.md` so every session has it in context:

```markdown
## Linear (project management)

Tool: `linearis` CLI, invoked via Bash. All output is JSON.

Discovery (do this before acting): run `linearis usage` once for the list of
domains, then `linearis <domain> usage` for a domain's full command reference.
Never guess flags or subcommands — check usage first.

Tickets: always reference by identifier, e.g. `ABC-123`.

Workflow rules:
- Ask which project a new ticket belongs to when it's unclear; subtasks inherit
  the parent's project by default.
- Keep the ticket description in sync when a task in it changes status.
- Record progress that isn't a simple checkbox change in a discussion thread
  (`issues discuss`), not in the description.

Files: `files download <url>` only fetches Linear storage URLs
(`uploads.linear.app`), such as images embedded in descriptions or comments.
Upload new files with `files upload <file>`; it returns an `assetUrl` you can
embed in descriptions or comments. `issues read --with-attachments` lists
resources linked to an issue (PRs, docs, external URLs) under an
`attachments.nodes` array whose entries carry a `url` — these are references,
not necessarily downloadable files.
```

## Documentation

- [MIGRATION_2026.4.9.md](MIGRATION_2026.4.9.md) — migrating from the deprecated `comments` domain to discussions (v2026.4.9).
- [`docs/`](docs/) — architecture, development, testing, and build-system references.
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
