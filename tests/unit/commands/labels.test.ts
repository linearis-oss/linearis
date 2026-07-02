import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
  })),
  getRootOpts: vi.fn(() => ({ apiToken: "test-token" })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return {
    ...actual,
    outputSuccess: vi.fn(),
  };
});

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/label-resolver.js", () => ({
  resolveLabelId: vi.fn().mockResolvedValue("resolved-label-uuid"),
}));

vi.mock("../../../src/services/label-service.js", () => ({
  createLabel: vi.fn().mockResolvedValue({
    id: "lbl-new",
    name: "branch:unmerged",
    color: "#B45309",
    type: "issue",
  }),
  getLabel: vi.fn().mockResolvedValue({
    id: "resolved-label-uuid",
    name: "branch:unmerged",
    color: "#B45309",
    type: "issue",
  }),
  updateLabel: vi.fn().mockResolvedValue({
    id: "resolved-label-uuid",
    name: "branch:merged",
    color: "#1D4ED8",
    type: "issue",
  }),
  deleteLabel: vi.fn().mockResolvedValue({
    id: "resolved-label-uuid",
    success: true,
  }),
  listLabels: vi.fn().mockResolvedValue({
    nodes: [{ id: "lbl-1", name: "Bug", color: "#ff0000", type: "issue" }],
    pageInfo: { hasNextPage: false, endCursor: null },
  }),
  listProjectLabels: vi.fn().mockResolvedValue({
    nodes: [
      {
        id: "plbl-1",
        name: "Customer",
        color: "#0000ff",
        type: "project",
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  }),
}));

import { setupLabelsCommands } from "../../../src/commands/labels.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveLabelId } from "../../../src/resolvers/label-resolver.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";
import {
  createLabel,
  deleteLabel,
  getLabel,
  listLabels,
  listProjectLabels,
  updateLabel,
} from "../../../src/services/label-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupLabelsCommands(program);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

describe("labels list", () => {
  it("routes to issue labels by default", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "labels", "list"]);

    expect(listLabels).toHaveBeenCalledWith(expect.anything(), undefined, {
      limit: 50,
      after: undefined,
      scope: undefined,
    });
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [{ id: "lbl-1", name: "Bug", color: "#ff0000", type: "issue" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });

  it("resolves team and lists issue labels", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--team",
      "ENG",
      "--limit",
      "10",
      "--after",
      "cur1",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(listLabels).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-team-uuid",
      {
        limit: 10,
        after: "cur1",
        scope: undefined,
      },
    );
    expect(listProjectLabels).not.toHaveBeenCalled();
  });

  it("passes workspace scope without team resolution", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--scope",
      "workspace",
    ]);

    expect(listLabels).toHaveBeenCalledWith(expect.anything(), undefined, {
      limit: 50,
      after: undefined,
      scope: "workspace",
    });
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
  });

  it("resolves team for explicit team scope", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--scope",
      "team",
      "--team",
      "ENG",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(listLabels).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-team-uuid",
      {
        limit: 50,
        after: undefined,
        scope: "team",
      },
    );
    expect(listProjectLabels).not.toHaveBeenCalled();
  });

  it("accepts an explicit issue type", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--type",
      "issue",
    ]);

    expect(listLabels).toHaveBeenCalledWith(expect.anything(), undefined, {
      limit: 50,
      after: undefined,
      scope: undefined,
    });
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("routes project label requests without team resolution", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--type",
      "project",
      "--limit",
      "25",
      "--after",
      "cur2",
    ]);

    expect(listProjectLabels).toHaveBeenCalledWith(expect.anything(), {
      limit: 25,
      after: "cur2",
    });
    expect(listLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [
        {
          id: "plbl-1",
          name: "Customer",
          color: "#0000ff",
          type: "project",
        },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });
});

describe("labels create", () => {
  it("creates a workspace issue label by default", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "create",
      "branch:unmerged",
    ]);

    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(createLabel).toHaveBeenCalledWith(expect.anything(), {
      name: "branch:unmerged",
    });
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "lbl-new",
      name: "branch:unmerged",
      color: "#B45309",
      type: "issue",
    });
  });

  it("creates a team-scoped issue label with optional fields", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "create",
      "branch:unmerged",
      "--team",
      "DBL",
      "--color",
      "#B45309",
      "--description",
      "Created from DBL branch workflow",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "DBL");
    expect(createLabel).toHaveBeenCalledWith(expect.anything(), {
      name: "branch:unmerged",
      teamId: "resolved-team-uuid",
      color: "#B45309",
      description: "Created from DBL branch workflow",
    });
  });
});

describe("labels read", () => {
  it("reads a label by resolved id", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "read",
      "branch:unmerged",
      "--team",
      "DBL",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "DBL");
    expect(resolveLabelId).toHaveBeenCalledWith(
      expect.anything(),
      "branch:unmerged",
      {
        teamId: "resolved-team-uuid",
        scope: undefined,
      },
    );
    expect(getLabel).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-label-uuid",
    );
  });
});

describe("labels update", () => {
  it("updates a resolved label", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "update",
      "branch:unmerged",
      "--team",
      "DBL",
      "--name",
      "branch:merged",
      "--color",
      "#1D4ED8",
      "--description",
      "Updated from DBL branch workflow",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "DBL");
    expect(resolveLabelId).toHaveBeenCalledWith(
      expect.anything(),
      "branch:unmerged",
      {
        teamId: "resolved-team-uuid",
        scope: undefined,
      },
    );
    expect(updateLabel).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-label-uuid",
      {
        name: "branch:merged",
        color: "#1D4ED8",
        description: "Updated from DBL branch workflow",
      },
    );
  });

  it("clears the description when passed an empty string", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "update",
      "branch:merged",
      "--description",
      "",
    ]);

    expect(updateLabel).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-label-uuid",
      {
        description: "",
      },
    );
  });
});

describe("labels delete", () => {
  it("deletes a resolved label", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "delete",
      "branch:unmerged",
      "--scope",
      "workspace",
    ]);

    expect(resolveLabelId).toHaveBeenCalledWith(
      expect.anything(),
      "branch:unmerged",
      {
        teamId: undefined,
        scope: "workspace",
      },
    );
    expect(deleteLabel).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-label-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "resolved-label-uuid",
      success: true,
    });
  });
});

describe("labels validation", () => {
  it("rejects unsupported label types", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--type",
      "initiative",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      'Invalid --type: must be one of "issue" or "project"',
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects unsupported scope values", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--scope",
      "org",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      'Invalid --scope: must be one of "workspace" or "team"',
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects team scope without a team filter", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--scope",
      "team",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --scope: team scope requires --team",
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects team filters for workspace scope", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--scope",
      "workspace",
      "--team",
      "ENG",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --team: cannot be used with --scope workspace",
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects team filters for project labels", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--type",
      "project",
      "--team",
      "ENG",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --team: cannot be used with --type project because project labels are workspace-scoped",
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects scope filters for project labels", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "list",
      "--type",
      "project",
      "--scope",
      "workspace",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --scope: cannot be used with --type project because project labels are always workspace-scoped",
    );
    expect(listLabels).not.toHaveBeenCalled();
    expect(listProjectLabels).not.toHaveBeenCalled();
    expect(resolveTeamId).not.toHaveBeenCalled();
  });

  it("rejects invalid label colors on create", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "create",
      "branch:unmerged",
      "--color",
      "B45309",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --color: must be a hex color like #B45309",
    );
    expect(createLabel).not.toHaveBeenCalled();
  });

  it("rejects invalid label colors on update", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "update",
      "branch:unmerged",
      "--color",
      "B45309",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --color: must be a hex color like #B45309",
    );
    expect(updateLabel).not.toHaveBeenCalled();
  });

  it("rejects update with no fields", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "update",
      "branch:unmerged",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid label update: at least one option must be provided",
    );
    expect(updateLabel).not.toHaveBeenCalled();
  });

  it("rejects team scope without a team filter for read", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "labels",
      "read",
      "branch:unmerged",
      "--scope",
      "team",
    ]);

    const errorOutput = JSON.parse(
      vi.mocked(console.error).mock.calls[0][0] as string,
    ) as { error: string };

    expect(errorOutput.error).toBe(
      "Invalid --scope: team scope requires --team",
    );
    expect(resolveLabelId).not.toHaveBeenCalled();
  });
});
