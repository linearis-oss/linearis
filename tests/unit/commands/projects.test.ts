import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
  })),
}));

vi.mock("../../../src/common/output.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/common/output.js")>();
  return {
    ...actual,
    outputSuccess: vi.fn(),
  };
});

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
  resolveProjectLabelIds: vi.fn().mockResolvedValue(["resolved-label-uuid"]),
}));

vi.mock("../../../src/resolvers/project-status-resolver.js", () => ({
  resolveProjectStatusId: vi.fn().mockResolvedValue("resolved-status-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/services/project-service.js", () => ({
  archiveProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Archived" }),
  listProjects: vi.fn().mockResolvedValue({ nodes: [], pageInfo: {} }),
  getProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
  createProject: vi.fn().mockResolvedValue({ id: "proj-new" }),
  deleteProject: vi.fn().mockResolvedValue({ id: "proj-1", success: true }),
  unarchiveProject: vi.fn().mockResolvedValue({ id: "proj-1", name: "Active" }),
  updateProject: vi.fn().mockResolvedValue({ id: "proj-1" }),
}));

import { setupProjectsCommands } from "../../../src/commands/projects.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import {
  archiveProject,
  createProject,
  deleteProject,
  getProject,
  unarchiveProject,
  updateProject,
} from "../../../src/services/project-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupProjectsCommands(program);
  return program;
}

describe("projects read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "read",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(getProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({ id: "proj-1" });
  });
});

describe("projects lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("archive resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "archive",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(archiveProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      name: "Archived",
    });
  });

  it("unarchive resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "unarchive",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
      { includeArchived: true },
    );
    expect(unarchiveProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      name: "Active",
    });
  });

  it("delete resolves project and outputs result", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "delete",
      "My Project",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
      { includeArchived: true },
    );
    expect(deleteProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
    );
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "proj-1",
      success: true,
    });
  });
});

describe("projects create --priority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("accepts valid priority 0", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "0",
    ]);

    expect(createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ priority: 0 }),
    );
  });

  it("accepts valid priority 4", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "4",
    ]);

    expect(createProject).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ priority: 4 }),
    );
  });

  it("rejects invalid priority 5", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "5",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must be 0-4"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it("rejects non-numeric priority", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "create",
      "My Project",
      "--teams",
      "ENG",
      "--priority",
      "abc",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must be 0-4"),
    );
    expect(createProject).not.toHaveBeenCalled();
  });
});

describe("projects update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("rejects update with no options", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("accepts update with valid option", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "projects",
      "update",
      "My Project",
      "--name",
      "New Name",
    ]);

    expect(updateProject).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      expect.objectContaining({ name: "New Name" }),
    );
  });
});
