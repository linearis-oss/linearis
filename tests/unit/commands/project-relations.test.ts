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
  resolveProjectRelationId: vi.fn().mockResolvedValue("relation-uuid"),
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
    createProjectRelation: vi.fn().mockResolvedValue({ id: "rel-1" }),
    updateProjectRelation: vi.fn().mockResolvedValue({ id: "rel-1" }),
    deleteProjectRelation: vi
      .fn()
      .mockResolvedValue({ id: "rel-1", success: true }),
  };
});

import { setupProjectRelationCommands } from "../../../src/commands/projects/relations.js";
import { resolveMilestoneId } from "../../../src/resolvers/milestone-resolver.js";
import { resolveProjectRelationId } from "../../../src/resolvers/project-relation-resolver.js";
import {
  createProjectRelation,
  deleteProjectRelation,
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

  it("remove takes a relation UUID directly", async () => {
    await run("remove", "relation-uuid");

    expect(resolveProjectRelationId).toHaveBeenCalledWith(
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

    expect(resolveProjectRelationId).toHaveBeenCalledWith(
      expect.anything(),
      "project-uuid-1",
      "project-uuid-2",
    );
    expect(deleteProjectRelation).toHaveBeenCalled();
  });
});
