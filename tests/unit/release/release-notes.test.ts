import { createRequire } from "node:module";
import { generateNotes } from "@semantic-release/release-notes-generator";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for silently empty release notes.
 *
 * `.releaserc.cjs` selects the `conventionalcommits` preset by bare specifier,
 * so the preset version that actually gets loaded is whatever npm resolves
 * from release-notes-generator's own directory. Preset v10 switched to the
 * `@conventional-changelog/writer@2` API (function `template`/`commitPartial`),
 * which release-notes-generator's Handlebars-based writer@8 cannot render: the
 * heading survives, every `### <group>` section and bullet disappears, and the
 * release still succeeds. These tests turn that silent data loss into a
 * failing check.
 */

type PluginEntry = string | [string, Record<string, unknown>];

const require = createRequire(import.meta.url);

function releaseNotesPluginConfig(): Record<string, unknown> {
  const config = require("../../../.releaserc.cjs") as {
    plugins: PluginEntry[];
  };

  const entry = config.plugins.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) &&
      plugin[0] === "@semantic-release/release-notes-generator",
  );

  if (!entry) {
    throw new Error(
      "no @semantic-release/release-notes-generator entry in .releaserc.cjs",
    );
  }

  return entry[1];
}

const COMMITS = [
  {
    hash: "1111111111111111111111111111111111111111",
    message: "feat(issues): add activity command\n\nCloses #144",
  },
  {
    hash: "2222222222222222222222222222222222222222",
    message: "fix(labels): allow clearing label description",
  },
  {
    hash: "3333333333333333333333333333333333333333",
    message: "chore(deps): bump something unreleasable",
  },
];

async function render(): Promise<string> {
  return generateNotes(releaseNotesPluginConfig(), {
    cwd: process.cwd(),
    options: { repositoryUrl: "https://github.com/linearis-oss/linearis" },
    lastRelease: { gitTag: "v2026.6.0", version: "2026.6.0" },
    nextRelease: { gitTag: "v2026.7.0", version: "2026.7.0", channel: null },
    commits: COMMITS,
    logger: { log: () => {}, error: () => {} },
  });
}

describe("release notes generation", () => {
  it("renders grouped sections and bullets for releasable commits", async () => {
    const notes = await render();

    expect(notes).toContain("### Features");
    expect(notes).toContain("### Bug Fixes");
    expect(notes).toContain("* **issues:** add activity command");
    expect(notes).toContain("* **labels:** allow clearing label description");
  });

  it("links commits and referenced issues", async () => {
    const notes = await render();

    expect(notes).toContain(
      "https://github.com/linearis-oss/linearis/commit/1111111",
    );
    expect(notes).toContain(
      "https://github.com/linearis-oss/linearis/issues/144",
    );
  });

  it("omits non-deliverable commit types", async () => {
    const notes = await render();

    expect(notes).not.toContain("bump something unreleasable");
  });
});
