import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({ gql: { request: vi.fn() } })),
  getRootOpts: vi.fn(() => ({ apiToken: "test-token" })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return { ...actual, outputSuccess: vi.fn() };
});

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi
    .fn()
    .mockImplementation(async (_client: unknown, nameOrId: string) =>
      nameOrId === "Downstream" ? "project-uuid-2" : "project-uuid-1",
    ),
  resolveProjectLabelIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/resolvers/project-relation-resolver.js", () => ({
  resolveProjectRelation: vi
    .fn()
    .mockResolvedValue({ id: "relation-uuid", inverted: false }),
}));

vi.mock("../../../src/resolvers/milestone-resolver.js", () => ({
  resolveMilestoneId: vi.fn().mockResolvedValue("milestone-uuid"),
}));

vi.mock("../../../src/services/project-relation-service.js", async () => {
  const actual = await import(
    "../../../src/services/project-relation-service.js"
  );
  return {
    PROJECT_RELATION_ANCHORS: actual.PROJECT_RELATION_ANCHORS,
    listProjectRelations: vi.fn().mockResolvedValue({ relations: [] }),
    listAllProjectRelations: vi
      .fn()
      .mockResolvedValue({ nodes: [], pageInfo: {} }),
    getProjectRelation: vi.fn().mockResolvedValue({
      id: "rel-1",
      project: { id: "project-uuid-1" },
      relatedProject: { id: "project-uuid-2" },
    }),
    createProjectRelation: vi.fn().mockResolvedValue({ id: "rel-1" }),
    updateProjectRelation: vi.fn().mockResolvedValue({ id: "rel-1" }),
    deleteProjectRelation: vi
      .fn()
      .mockResolvedValue({ id: "rel-1", success: true }),
  };
});

import { setupProjectRelationCommands } from "../../../src/commands/projects/relations.js";
import { asUuid } from "../../../src/common/identifier.js";
import { resolveMilestoneId } from "../../../src/resolvers/milestone-resolver.js";
import { resolveProjectRelation } from "../../../src/resolvers/project-relation-resolver.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import {
  createProjectRelation,
  deleteProjectRelation,
  getProjectRelation,
  listAllProjectRelations,
  listProjectRelations,
  updateProjectRelation,
} from "../../../src/services/project-relation-service.js";

async function run(...argv: string[]): Promise<void> {
  const program = new Command();
  program.option("--api-token <token>");
  setupProjectRelationCommands(program.command("projects"));
  await program.parseAsync(["node", "test", "projects", "relations", ...argv]);
}

describe("projects relations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("list resolves the project", async () => {
    await run("list", "Upstream");

    expect(listProjectRelations).toHaveBeenCalledWith(
      expect.anything(),
      "project-uuid-1",
    );
  });

  it("list without a project pages the workspace-wide connection", async () => {
    await run("list", "--limit", "10");

    expect(listAllProjectRelations).toHaveBeenCalledWith(expect.anything(), {
      limit: 10,
      after: undefined,
    });
    expect(listProjectRelations).not.toHaveBeenCalled();
  });

  it("list rejects --limit alongside a project rather than ignoring it", async () => {
    await run("list", "Upstream", "--limit", "200");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be used with a project"),
    );
    expect(listProjectRelations).not.toHaveBeenCalled();
  });

  it("list rejects --after alongside a project rather than ignoring it", async () => {
    await run("list", "Upstream", "--after", "cursor");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be used with a project"),
    );
    expect(listProjectRelations).not.toHaveBeenCalled();
  });

  it("list still accepts a project when the limit is left at its default", async () => {
    await run("list", "Upstream");

    expect(listProjectRelations).toHaveBeenCalledWith(
      expect.anything(),
      "project-uuid-1",
    );
  });

  it("read resolves the relation and returns it", async () => {
    await run("read", "relation-uuid");

    expect(getProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
    );
  });

  it("add defaults to end-to-start, the finish-before-start shape", async () => {
    await run("add", "Upstream", "--blocks", "Downstream");

    expect(createProjectRelation).toHaveBeenCalledWith(expect.anything(), {
      projectId: "project-uuid-1",
      relatedProjectId: "project-uuid-2",
      anchorType: "end",
      relatedAnchorType: "start",
    });
  });

  it("add honours explicit anchors", async () => {
    await run(
      "add",
      "Upstream",
      "--blocks",
      "Downstream",
      "--from",
      "start",
      "--to",
      "end",
    );

    expect(createProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        anchorType: "start",
        relatedAnchorType: "end",
      }),
    );
  });

  it("add rejects an anchor outside the observed literals", async () => {
    await run("add", "Upstream", "--blocks", "Downstream", "--from", "middle");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --from"),
    );
    expect(createProjectRelation).not.toHaveBeenCalled();
  });

  it("add refuses to relate a project to itself", async () => {
    await run("add", "Upstream", "--blocks", "Upstream");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot depend on itself"),
    );
    expect(createProjectRelation).not.toHaveBeenCalled();
  });

  it("add scopes each milestone to the project that owns that end", async () => {
    await run(
      "add",
      "Upstream",
      "--blocks",
      "Downstream",
      "--from-milestone",
      "Beta",
      "--to-milestone",
      "Kickoff",
    );

    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "Beta",
      "project-uuid-1",
    );
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "Kickoff",
      "project-uuid-2",
    );
  });

  it("update maps --clear-from-milestone to an explicit null", async () => {
    await run("update", "relation-uuid", "--clear-from-milestone");

    expect(updateProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
      { projectMilestoneId: null },
    );
  });

  it("update refuses contradictory milestone flags", async () => {
    await run(
      "update",
      "relation-uuid",
      "--from-milestone",
      "Beta",
      "--clear-from-milestone",
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be combined with --clear-from-milestone"),
    );
    expect(updateProjectRelation).not.toHaveBeenCalled();
  });

  it("update requires at least one option", async () => {
    await run("update", "relation-uuid");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
    expect(updateProjectRelation).not.toHaveBeenCalled();
  });

  it("update rejects an empty update before resolving the relation", async () => {
    await run("update", "Upstream", "--blocks", "Downstream");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
    expect(resolveProjectId).not.toHaveBeenCalled();
    expect(resolveProjectRelation).not.toHaveBeenCalled();
  });

  it("update swaps both ends when the relation is stored inverted", async () => {
    vi.mocked(resolveProjectRelation).mockResolvedValueOnce({
      id: asUuid("relation-uuid"),
      inverted: true,
    });

    await run(
      "update",
      "Downstream",
      "--blocks",
      "Upstream",
      "--from",
      "start",
      "--to-milestone",
      "Kickoff",
    );

    // The caller named Downstream first, but the relation belongs to Upstream:
    // Downstream's anchor is the relation's *related* end.
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "Kickoff",
      "project-uuid-1",
    );
    expect(updateProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
      { relatedAnchorType: "start", projectMilestoneId: "milestone-uuid" },
    );
  });

  it("update scopes a milestone to the relation's own ends on the UUID path", async () => {
    await run(
      "update",
      "relation-uuid",
      "--from-milestone",
      "Beta",
      "--to-milestone",
      "Kickoff",
    );

    expect(getProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
    );
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "Beta",
      "project-uuid-1",
    );
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      expect.anything(),
      "Kickoff",
      "project-uuid-2",
    );
  });

  it("update reads the ends back only when a milestone flag needs them", async () => {
    await run("update", "relation-uuid", "--from", "start");

    expect(getProjectRelation).not.toHaveBeenCalled();
  });

  it("remove takes a relation UUID directly", async () => {
    await run("remove", "relation-uuid");

    expect(resolveProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
    );
    expect(deleteProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "relation-uuid",
    );
  });

  it("remove finds the relation from a project pair", async () => {
    await run("remove", "Upstream", "--blocks", "Downstream");

    expect(resolveProjectRelation).toHaveBeenCalledWith(
      expect.anything(),
      "project-uuid-1",
      "project-uuid-2",
    );
    expect(deleteProjectRelation).toHaveBeenCalled();
  });
});
