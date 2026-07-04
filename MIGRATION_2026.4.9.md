# Migration Guide — v2026.4.9: `comments` → discussions

**Introduced in:** v2026.4.9 (2026-04-27) · **Status of `comments`:** deprecated compatibility facade

## What changed

Before v2026.4.9, Linearis exposed a flat `comments` domain: a single list of comments per issue, with replies that were hard to relate back to their parent.

v2026.4.9 replaces that with **discussions** — threaded conversations modeled the way Linear itself models them. A discussion is a **root thread** with a body, and each root thread has an ordered list of **replies** (which may themselves be nested). Discussions are available across multiple domains (`issues`, `projects`, `initiatives`), not just issues.

The old `comments` commands still work — they now route through the discussion service as a **deprecated compatibility facade** — so existing scripts keep running. New automation and agent prompts should use the discussion commands directly.

## Why the change

- **Faithful data model.** Linear's API represents conversations as threads with replies. The old flat `comments` view flattened that structure and lost the parent/child relationship. Discussions expose it directly.
- **Nested replies.** Deep reply chains are now represented correctly instead of being collapsed into one level.
- **Consistency across domains.** The same discussion model applies to issues, projects, and initiatives, so agents learn one pattern instead of an issue-only special case.
- **Reactions.** v2026.4.9 also added reaction workflows on discussions, which the flat comment model could not express cleanly.

## Command mapping

| Deprecated (`comments`) | Preferred (`issues`) |
|---|---|
| `linearis comments create <issue> --body <text>` | `linearis issues discuss <issue> --body <text>` |
| `linearis comments list <issue>` | `linearis issues discussions <issue>` |
| `linearis comments reply <thread> --body <text>` | `linearis issues reply <thread> --body <text>` |
| `linearis comments edit <reply> --body <text>` | `linearis issues edit-reply <reply> --body <text>` |
| `linearis comments delete <reply>` | `linearis issues delete-reply <reply>` |

Projects and initiatives expose the equivalent discussion subcommands in their own domains — run `linearis projects usage` or `linearis initiatives usage` for the exact commands.

## What to respect

- **Root threads vs. replies are distinct.** `issues discussions <issue>` lists **root** threads. Replying with `issues reply <thread>` requires a **root discussion thread ID**, not a reply ID. Passing a reply ID where a root thread ID is expected will fail.
- **Fetch replies explicitly.** `issues discussions <issue>` returns root threads only. Use `issues replies <thread>` to load the replies within one thread, including nested replies.
- **Discussions are domain-scoped.** A thread belongs to the domain it was created in. Operating on a thread through the wrong domain is rejected.
- **Compatibility facade is more lenient.** The deprecated `comments edit`/`delete` commands accept both root thread IDs and reply IDs. The new discussion commands are strict about which ID they expect — do not assume the facade's leniency carries over.
- **Prefer discussions over description edits for progress.** For anything beyond simple checkbox updates, start or continue a discussion thread rather than rewriting an issue's description.

## Timeline

- **v2026.4.9 (2026-04-27)** — discussion commands added across `issues`, `projects`, and `initiatives`; `comments` deprecated as a compatibility facade.
- **A future release** — the `comments` facade may be removed. Migrate before then.

> [!TIP]
> Run `linearis issues usage` for the full, always-current discussion command reference.
