import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Interactive coverage sweep.
 *
 * Guards two invariants so a new command cannot ship without interactive
 * support:
 *
 *  1. Any create/update command's file must wire `maybeCollectInteractive`
 *     (i.e. a wizard spec is run for the command's options).
 *  2. Any positional-id command whose single leading positional is an
 *     enumerable entity must optionalise it (`[arg]`, not `<arg>`) so the entity
 *     picker can fill it — UNLESS it is on the intentional-skip allowlist below.
 *
 * Skips are commands whose leading positional is a raw comment/thread/reaction
 * UUID with no clean parent-scoped enumeration in that command, or a second
 * required positional that cannot be picked (Commander forbids optional-before-
 * required). These mirror the Phase 2–4 design: discussion subcommands keyed by
 * a bare comment/thread UUID stay `<arg>`.
 */

const COMMANDS_DIR = join(process.cwd(), "src/commands");

/** command signatures (verb + positionals) intentionally left with `<arg>`. */
const SKIP_REQUIRED_POSITIONAL = new Set<string>([
  // `unreact-id` targets a reaction by raw UUID; no per-comment reaction list
  // service exists to source a picker, so it stays a flag-only escape hatch.
  "unreact-id",
  // full-text search takes a free-text query, not an entity id
  "search",
  // create's leading positional is a free-text name/title filled by the
  // wizard's text field, not an entity picker (covered by the wizard invariant)
  "create",
]);

function listCommandFiles(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(COMMANDS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const sub of readdirSync(join(COMMANDS_DIR, entry.name))) {
        if (sub.endsWith(".ts")) files.push(join(entry.name, sub));
      }
    } else if (entry.name.endsWith(".ts")) {
      files.push(entry.name);
    }
  }
  return files;
}

interface CommandDef {
  file: string;
  verb: string;
  raw: string;
}

function extractCommands(content: string, file: string): CommandDef[] {
  const defs: CommandDef[] = [];
  for (const match of content.matchAll(/\.command\("([^"]+)"\)/g)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const verb = raw.split(" ")[0];
    if (verb === undefined) continue;
    defs.push({ file, verb, raw });
  }
  return defs;
}

describe("interactive coverage sweep", () => {
  const files = listCommandFiles();
  const perFile = new Map<string, string>();
  for (const file of files) {
    perFile.set(file, readFileSync(join(COMMANDS_DIR, file), "utf-8"));
  }

  it("every create/update command references a matching field wizard spec", () => {
    // A bare `maybeCollectInteractive` string is insufficient — a file can wire
    // it for an entity/positional picker over an EMPTY_SPEC while leaving the
    // create/update fields un-prompted (this is exactly how the teams and
    // initiative-updates drift gaps hid). Require the file to reference a
    // verb-matched `*CreateSpec` / `*UpdateSpec`, which only exists when a real
    // field wizard was declared for that command.
    const offenders: string[] = [];
    for (const [file, content] of perFile) {
      const cmds = extractCommands(content, file);
      if (
        cmds.some((c) => c.verb === "create") &&
        !/spec:\s*\w*CreateSpec\b/.test(content)
      ) {
        offenders.push(`${file} (create)`);
      }
      if (
        cmds.some((c) => c.verb === "update") &&
        !/spec:\s*\w*UpdateSpec\b/.test(content)
      ) {
        offenders.push(`${file} (update)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("positional-id commands optionalise their leading entity positional", () => {
    const offenders: string[] = [];
    for (const [file, content] of perFile) {
      for (const { verb, raw } of extractCommands(content, file)) {
        // Only the leading positional matters for the picker.
        const requiresLeadingPositional = /^\S+\s+<[^>]+>/.test(raw);
        if (!requiresLeadingPositional) continue;
        if (SKIP_REQUIRED_POSITIONAL.has(verb)) continue;
        offenders.push(`${file}: ${raw}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("content domains export the expected wizard specs", async () => {
    const comments = await import("../../../src/commands/comments.js");
    const documents = await import("../../../src/commands/documents.js");
    const attachments = await import("../../../src/commands/attachments.js");
    expect(comments.commentCreateSpec).toBeDefined();
    expect(documents.documentCreateSpec).toBeDefined();
    expect(documents.documentUpdateSpec).toBeDefined();
    expect(attachments.attachmentCreateSpec).toBeDefined();
  });

  it("drift-added write domains export their wizard specs", async () => {
    const teams = await import("../../../src/commands/teams.js");
    const initiativeUpdates = await import(
      "../../../src/commands/initiatives/updates.js"
    );
    expect(teams.teamCreateSpec).toBeDefined();
    expect(teams.teamUpdateSpec).toBeDefined();
    expect(initiativeUpdates.initiativeUpdateCreateSpec).toBeDefined();
    expect(initiativeUpdates.initiativeUpdateUpdateSpec).toBeDefined();
  });
});
