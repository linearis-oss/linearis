---
name: linearis
description: >-
  Manage Linear.app work from the command line with the linearis CLI (bins
  linearis / linear), which outputs JSON: issues/tickets, projects, cycles
  (sprints), milestones, initiatives (roadmap), documents, labels, teams,
  users, and issue discussions/comments. Use when the user mentions Linear, a
  ticket identifier like ENG-42 or ABC-123, sprints, triage, or the roadmap, or
  asks to create, read, search, update, assign, comment on, or otherwise manage
  Linear issues and projects.
license: MIT
compatibility: Requires the linearis CLI (npm i -g linearis), Node >=22, and a Linear API token.
allowed-tools: Bash(linearis:*), Bash(linear:*), Bash(jq:*)
metadata:
  author: linearis-oss
  version: "1.0.0"
---

# linearis

Drive [Linear.app](https://linear.app) from the shell via the `linearis` CLI (JSON-only output; `linear` is an alias). Do not guess the command surface — the CLI documents itself, and this skill teaches the protocol, not the flags.

## Preflight (reactive — branch on the CLI's own output; don't pre-run checks every turn)

- **Not installed** — if the shell reports command-not-found, tell the user linearis isn't installed and offer `npm install -g linearis`. As a no-install fallback, prefix commands with `npx linearis@latest` (adds cold-start latency and needs network per call — fallback, not default). Never silently `npm install -g`.
- **Auth required** — any command may fail with this envelope on stderr and exit code 42:
  `{ "error": "AUTHENTICATION_REQUIRED", "action": "USER_ACTION_REQUIRED", "instruction": "Run 'linearis auth' …", "exit_code": 42 }`.
  Detect it by `exit_code === 42` / `error === "AUTHENTICATION_REQUIRED"` (not paraphrased text) and surface the CLI's own `instruction`. `linearis auth` is an interactive browser flow you cannot complete — hand it to the user.
- **Updates (advisory, never blocking)** — optionally run `linearis version check` once → `{ current, latest, channel, updateAvailable }`. If `updateAvailable` is true, mention it and ask the user before `npm install -g linearis@latest`, honoring `channel` (don't move a `next` user to `latest`). npm can hang or rate-limit; on any timeout/error just proceed with the installed version. Read the plain installed version with `linearis version` (JSON), not `--version`.

## Discover, then act

1. Run `linearis usage` once for the list of domains (issues, projects, cycles, …).
2. Run `linearis <domain> usage` for a domain's full command and flag reference **before** acting.
3. Never invent flags or subcommands — `usage` is authoritative and always current.

## Output

Every command prints JSON on stdout. Shape it at the source with the global `--fields identifier,title,state.name` and `--compact` — no external binary, works on Windows and fresh containers. Reach for `jq` only for complex reshaping, and fall back to raw JSON if `jq` is absent.

## Invariants worth knowing (everything else lives in `usage`)

- IDs are forgiving: pass a UUID, team key (`ENG`), issue identifier (`ABC-123`), or name interchangeably. Reference tickets by identifier.
- `issues create` requires `--team`; some filters need a scope flag — confirm in `usage` rather than memorizing.
- Threaded discussion lives under `issues discuss` / `discussions` / `replies` / `reply`. The top-level `comments` domain is a deprecated facade (still works) — prefer the `issues` discussion commands. Record non-trivial progress in a discussion thread and keep the description in sync on status changes.
- `files download <url>` only fetches Linear storage URLs (`uploads.linear.app`); `files upload` returns an `assetUrl` you can embed; `issues read --with-attachments` lists linked resources (PRs, docs, URLs) — references, not necessarily downloadable files.

For anything not covered here, `linearis <domain> usage` is the reference.
