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
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
  resolveProjectLabelIds: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/services/project-update-service.js", () => ({
  listProjectUpdates: vi.fn().mockResolvedValue({ nodes: [], pageInfo: {} }),
  getProjectUpdate: vi.fn().mockResolvedValue({ id: "upd-1" }),
  createProjectUpdate: vi.fn().mockResolvedValue({ id: "upd-new" }),
  editProjectUpdate: vi.fn().mockResolvedValue({ id: "upd-1" }),
  archiveProjectUpdate: vi.fn().mockResolvedValue({ id: "upd-1" }),
  unarchiveProjectUpdate: vi.fn().mockResolvedValue({ id: "upd-1" }),
  remindProjectUpdate: vi
    .fn()
    .mockResolvedValue({ projectId: "proj-1", success: true }),
}));

import { setupProjectUpdateCommands } from "../../../src/commands/projects/updates.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveProjectId } from "../../../src/resolvers/project-resolver.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  archiveProjectUpdate,
  createProjectUpdate,
  editProjectUpdate,
  getProjectUpdate,
  listProjectUpdates,
  remindProjectUpdate,
} from "../../../src/services/project-update-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  const projects = program.command("projects");
  setupProjectUpdateCommands(projects);
  return program;
}

describe("projects updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("list resolves the project and forwards pagination", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "list",
      "--project",
      "My Project",
      "--limit",
      "10",
      "--include-archived",
    ]);

    expect(resolveProjectId).toHaveBeenCalledWith(
      expect.anything(),
      "My Project",
    );
    expect(listProjectUpdates).toHaveBeenCalledWith(expect.anything(), {
      projectId: "resolved-project-uuid",
      limit: 10,
      after: undefined,
      includeArchived: true,
    });
  });

  it("read passes the update ID straight through", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "read",
      "upd-1",
    ]);

    expect(getProjectUpdate).toHaveBeenCalledWith(expect.anything(), "upd-1");
    expect(outputSuccess).toHaveBeenCalledWith({ id: "upd-1" });
  });

  it("create maps --health and --hide-diff onto the input", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "create",
      "--project",
      "My Project",
      "--body",
      "Week 1",
      "--health",
      "atrisk",
      "--hide-diff",
    ]);

    expect(createProjectUpdate).toHaveBeenCalledWith(expect.anything(), {
      projectId: "resolved-project-uuid",
      body: "Week 1",
      health: "atRisk",
      isDiffHidden: true,
    });
  });

  it("create rejects an unknown health value", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "create",
      "--project",
      "My Project",
      "--health",
      "sideways",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--health"),
    );
    expect(createProjectUpdate).not.toHaveBeenCalled();
  });

  it("update requires at least one field", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "update",
      "upd-1",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("at least one option must be provided"),
    );
    expect(editProjectUpdate).not.toHaveBeenCalled();
  });

  it("archive passes the update ID straight through", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "archive",
      "upd-1",
    ]);

    expect(archiveProjectUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "upd-1",
    );
  });

  it("remind resolves the target user when one is named", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "remind",
      "--project",
      "My Project",
      "--user",
      "alice",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(expect.anything(), "alice");
    expect(remindProjectUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      "resolved-user-uuid",
    );
  });

  it("remind leaves the target unset when no user is named", async () => {
    await createProgram().parseAsync([
      "node",
      "test",
      "projects",
      "updates",
      "remind",
      "--project",
      "My Project",
    ]);

    expect(resolveUserId).not.toHaveBeenCalled();
    expect(remindProjectUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-project-uuid",
      undefined,
    );
  });
});
