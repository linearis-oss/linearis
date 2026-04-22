# Linearis

CLI tool for [Linear.app](https://linear.app) optimized for AI agents. JSON output, smart ID resolution, token-efficient usage commands, and a discover-then-act workflow that keeps agent context small. Works just as well for humans who prefer structured data on the command line.

## Why?

The official Linear MCP works fine, but it eats up ~13k tokens just by being connected -- before the agent does anything. Linearis takes a different approach: instead of exposing the full API surface upfront, agents discover what they need through a two-tier usage system. `linearis usage` gives an overview in ~200 tokens, then `linearis <domain> usage` provides the full reference for one area in ~300-500 tokens. A typical agent interaction costs ~500-700 tokens of context, not ~13k.

The trade-off is coverage. An MCP exposes the entire Linear API; Linearis covers the operations that matter for day-to-day work with issues, comments, cycles, documents, and files. If you need to manage custom workflows, integrations, or workspace settings, the MCP is the better choice.

**This project scratches my own itches,** and satisfies my own usage patterns of working with Linear: I **do** work with tickets/issues and comments on the command line; I **do not** manage projects or workspaces etc. there. YMMV.

## Installation

```bash
npm install -g linearis
```

`linearis` is the canonical documented command; `linear` is a fully supported alias that runs the same CLI.

Requires Node.js >= 22.

## Authentication

```bash
linearis auth login
```

This opens Linear in your browser, guides you through creating an API key, and stores the token encrypted in `~/.linearis/token`.

Alternatively, provide a token directly:

```bash
# Via CLI flag
linearis --api-token <token> issues list

# Via environment variable
LINEAR_API_TOKEN=<token> linearis issues list
```

Token resolution order: `--api-token` flag > `LINEAR_API_TOKEN` env > `~/.linearis/token` > `~/.linear_api_token` (deprecated).

## Usage

All output is JSON. Pipe through `jq` or similar for formatting.

```bash
# Discovery
linearis usage                # overview of all domains
linearis issues usage         # detailed usage for one domain
```

### Quick Start

```bash
# Discover available commands
linearis usage

# Drill into a domain
linearis issues usage

# List recent issues
linearis issues list --limit 10

# Search for issues
linearis issues search "authentication bug"

# Create an issue
linearis issues create "Fix login flow" --team Platform --priority 2

# Add a comment
linearis comments create ENG-42 --body "Investigating this now"
```

For the full reference of every command and flag, run:

```bash
linearis <domain> usage
```

## AI Agent Integration

### How agents use Linearis

The CLI is structured around a discover-then-act pattern that matches how agents work:

1. **Discover** -- `linearis usage` returns a compact overview of all domains (~200 tokens). The agent reads this once to understand what's available.
2. **Drill down** -- `linearis <domain> usage` gives the full command reference for one domain (~300-500 tokens). The agent only loads what it needs.
3. **Execute** -- All commands return structured JSON. No parsing of human-readable tables or prose.

This means the agent never loads the full API surface into context. It pays for what it uses, one domain at a time.

### Linearis vs. MCP

| | Linearis | Linear MCP |
|---|---|---|
| Context cost | ~500-700 tokens per interaction | ~13k tokens on connect |
| Coverage | Common operations (issues, comments, cycles, docs, files) | Full Linear API |
| Output | JSON via stdout | Tool call responses |
| Setup | `npm install -g linearis` + bash tool | MCP server connection |

Use Linearis when token efficiency matters and you work primarily with issues and related data. Use the MCP when you need full API coverage or tight tool-call integration.

### Example prompt

```markdown
## Linear (project management)

Tool: `linearis` CLI via Bash. All output is JSON.

Discovery: Run `linearis usage` once to see available domains. Run `linearis <domain> usage` for full command reference of a specific domain. Do NOT guess flags or subcommands -- check usage first.

Ticket format: "ABC-123". Always reference tickets by their identifier.

Workflow rules:
- When creating a ticket, ask the user which project to assign it to if unclear.
- For subtasks, inherit the parent ticket's project by default.
- When a task in a ticket description changes status, update the description.
- For progress beyond simple checkbox changes, add a comment instead of editing the description.

File handling: `issues read` returns an `embeds` array with signed download URLs and expiration timestamps. Use `files download` to retrieve them. Use `files upload` to attach new files, then reference the returned URL in comments or descriptions.
```

Add this (or a version adapted to your workflow) to your `AGENTS.md` or `CLAUDE.md` so every agent session has it in context automatically.

## Release Automation Policy

Releases are automated by GitHub Actions via `.github/workflows/release-check.yml`.

- `next` (default branch): release runs on every push (prerelease channel)
- `main` (stable branch): release runs on weekly schedule
- Manual `workflow_dispatch` supports releasing from either `main` or `next`
- `CHANGELOG.md` is automation-owned and must not be edited in pull requests

If a pull request branch contains `CHANGELOG.md` changes anywhere in `main...HEAD` history, CI fails and posts rebase instructions.

## Contributing

Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Creator

Carlo Zottmann -- [c.zottmann.dev](https://c.zottmann.dev) | [github.com/czottmann](https://github.com/czottmann)

Carlo created Linearis and drove its early development. As interest in the project grew, he handed maintenance over to [Fabian Jocks](https://github.com/iamfj) ([in/fabianjocks](https://linkedin.com/in/fabianjocks)).

This project is neither affiliated with nor endorsed by Linear.

### Sponsoring Carlo's work

Carlo doesn't accept sponsoring in the "GitHub sponsorship" sense[^1] but [next to his own apps, he also sells "Tokens of Appreciation"](https://actions.work/store/?ref=github). Any support is appreciated!

[^1]: Apparently, the German revenue service is still having some fits over "money for nothing??".

> [!TIP]
> Carlo makes Shortcuts-related macOS & iOS productivity apps like [Actions For Obsidian](https://actions.work/actions-for-obsidian), [Browser Actions](https://actions.work/browser-actions) (which adds Shortcuts support for several major browsers), and [BarCuts](https://actions.work/barcuts) (a surprisingly useful contextual Shortcuts launcher). Check them out!

## Contributors

<a href="https://github.com/linearis-oss/linearis/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=linearis-oss/linearis" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## License

MIT. See [LICENSE.md](LICENSE.md).
