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

### Issues

```bash
# List recent issues
linearis issues list --limit 10

# Search issues by text
linearis issues list --query "authentication" --team Platform

# Create an issue
linearis issues create "Fix login timeout" --team Backend \
  --assignee "Jane Doe" --labels "Bug,Critical" --priority 1 \
  --description "Users report session expiry after 5 minutes"

# Read issue details (supports ABC-123 identifiers)
linearis issues read DEV-456

# Update status, priority, labels
linearis issues update ABC-123 --status "In Review" --priority 2
linearis issues update DEV-789 --labels "Frontend,UX" --label-mode add
linearis issues update ABC-123 --clear-labels

# Parent-child relationships
linearis issues update SUB-001 --parent-ticket EPIC-100

# Issue relations
linearis issues create "Blocked task" --team Backend --blocked-by DEV-123
linearis issues update ABC-123 --blocks DEV-456
linearis issues update ABC-123 --relates-to DEV-789
linearis issues update ABC-123 --remove-relation DEV-456
```

### Comments

```bash
linearis comments create ABC-123 --body "Fixed in PR #456"
```

### Documents

```bash
# Create a document (optionally link to a project and/or issue)
linearis documents create --title "API Design" --content "# Overview..."
linearis documents create --title "Bug Analysis" --project "Backend" --issue ABC-123

# List documents
linearis documents list
linearis documents list --project "Backend"
linearis documents list --issue ABC-123

# Read, update, delete
linearis documents read <document-id>
linearis documents update <document-id> --title "New Title" --content "Updated content"
linearis documents delete <document-id>
```

### Cycles

```bash
# List cycles for a team
linearis cycles list --team Backend --limit 10

# Active cycle only
linearis cycles list --team Backend --active

# Active cycle +/- 3 neighbors
linearis cycles list --team Backend --window 3

# Read cycle details
linearis cycles read "Sprint 2025-10" --team Backend
```

### Milestones

```bash
# List milestones in a project
linearis milestones list --project "Backend"

# Read milestone details
linearis milestones read "Beta Release" --project "Backend"

# Create and update milestones
linearis milestones create "v2.0" --project "Backend" --target-date 2025-06-01
linearis milestones update "v2.0" --project "Backend" --description "Major release"
```

### Files

```bash
# Download a file from Linear storage
linearis files download "https://uploads.linear.app/.../file.png" --output ./screenshot.png

# Upload and reference in a comment
URL=$(linearis files upload ./bug.png | jq -r .assetUrl)
linearis comments create ABC-123 --body "Screenshot: ![$URL]($URL)"
```

### Projects, Labels, Teams, Users

```bash
linearis projects list
linearis labels list --team Backend
linearis teams list
linearis users list --active
```

### Pagination

All list commands support cursor-based pagination:

```bash
linearis issues list --limit 25
# Response includes pageInfo with endCursor and hasNextPage

linearis issues list --limit 25 --after "cursor-from-previous-response"
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

## Development

```bash
git clone https://github.com/czottmann/linearis.git
cd linearis
npm install
npm start      # Development mode (tsx, no compilation)
npm test       # Run tests
npm run build  # Compile to dist/
```

### Agent skills

This project uses shared agent skills managed through [skills.sh](https://skills.sh), an open ecosystem of reusable capabilities for AI coding agents. Skills are procedural instructions (not code) that teach agents workflows like test-driven development, systematic debugging, or code review.

Skills are installed into `.agents/skills/` and automatically symlinked to the locations that tools like [Claude Code](https://claude.ai/product/claude-code) (`.claude/skills/`) or [Cursor](https://cursor.com) expect. This means skills are defined once and work across agents without duplication.

```bash
# Install a skill from the registry
npx skills add obra/superpowers/systematic-debugging

# Install all skills defined in the project
npx skills install
```

**How it works:**

- `.agents/skills/` is the source of truth. Each skill is a directory with a `SKILL.md` file that the agent loads on demand.
- `.claude/skills/` contains symlinks pointing back to `.agents/skills/`. These are created automatically by `skills.sh` and should not be edited directly.
- `CLAUDE.md` is a symlink to `AGENTS.md`. Both serve the same purpose -- providing agent-wide instructions -- but different tools look for different filenames.

**Best practices:**

- Commit `.agents/skills/` to the repo so every contributor gets the same agent behavior out of the box.
- Prefer project-scoped skills (`.agents/skills/`) over global ones (`~/.agents/skills/`) for anything specific to this codebase. Global skills are good for personal preferences like commit style or code review habits.
- Keep skills focused. One skill per concern. A skill that tries to cover debugging, testing, and deployment is harder to maintain and slower for agents to load.
- Review skills before installing. They are plain markdown, so read the `SKILL.md` before adding one to the project.

Browse available skills at [skills.sh](https://skills.sh) or search with `npx skills search <query>`.

## Maintainer

Fabian Jocks -- [github.com/iamfj](https://github.com/iamfj) | [linkedin.com/in/fabianjocks](https://linkedin.com/in/fabianjocks)

## Original Author

Carlo Zottmann -- [c.zottmann.dev](https://c.zottmann.dev) | [github.com/czottmann](https://github.com/czottmann)

Carlo created Linearis and drove its early development. As interest in the project grew, he handed maintenance over to Fabian.

This project is neither affiliated with nor endorsed by Linear.

### Sponsoring Carlo's work

Carlo doesn't accept sponsoring in the "GitHub sponsorship" sense[^1] but [next to his own apps, he also sells "Tokens of Appreciation"](https://actions.work/store/?ref=github). Any support is appreciated!

[^1]: Apparently, the German revenue service is still having some fits over "money for nothing??".

> [!TIP]
> Carlo makes Shortcuts-related macOS & iOS productivity apps like [Actions For Obsidian](https://actions.work/actions-for-obsidian), [Browser Actions](https://actions.work/browser-actions) (which adds Shortcuts support for several major browsers), and [BarCuts](https://actions.work/barcuts) (a surprisingly useful contextual Shortcuts launcher). Check them out!

## Contributors

- [Fabian Jocks](https://github.com/iamfj)
- [Ryan Rozich](https://github.com/ryanrozich)
- [Chad Walters](https://github.com/chadrwalters)
- [Louis Mandelstam](https://github.com/man8)
- [Ralf Schimmel](https://github.com/ralfschimmel)

## License

MIT. See [LICENSE.md](LICENSE.md).
