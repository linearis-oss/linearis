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

vi.mock("../../../src/resolvers/project-status-resolver.js", () => ({
  resolveProjectStatusId: vi
    .fn()
    .mockImplementation(async (_client: unknown, nameOrId: string) =>
      nameOrId === "In Review" ? "status-uuid-2" : "status-uuid-1",
    ),
}));

vi.mock("../../../src/services/project-status-service.js", () => ({
  listProjectStatuses: vi.fn().mockResolvedValue({ nodes: [] }),
  getProjectStatus: vi.fn().mockResolvedValue({ id: "st-1" }),
  createProjectStatus: vi.fn().mockResolvedValue({ id: "st-new" }),
  updateProjectStatus: vi.fn().mockResolvedValue({ id: "st-1" }),
  reassignProjectStatus: vi.fn().mockResolvedValue(undefined),
  archiveProjectStatus: vi.fn().mockResolvedValue({ id: "st-1" }),
  unarchiveProjectStatus: vi.fn().mockResolvedValue({ id: "st-1" }),
}));

import { setupProjectStatusCommands } from "../../../src/commands/projects/statuses.js";
import { resolveProjectStatusId } from "../../../src/resolvers/project-status-resolver.js";
import {
  archiveProjectStatus,
  createProjectStatus,
  listProjectStatuses,
  reassignProjectStatus,
  unarchiveProjectStatus,
  updateProjectStatus,
} from "../../../src/services/project-status-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupProjectStatusCommands(program.command("projects"));
  return program;
}

async function run(...argv: string[]): Promise<void> {
  await createProgram().parseAsync(["node", "test", "projects", ...argv]);
}

describe("projects statuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("list forwards --include-archived", async () => {
    await run("statuses", "list", "--include-archived");

    expect(listProjectStatuses).toHaveBeenCalledWith(expect.anything(), true);
  });

  it("read resolves archived statuses too", async () => {
    await run("statuses", "read", "Done");

    expect(resolveProjectStatusId).toHaveBeenCalledWith(
      expect.anything(),
      "Done",
      { includeArchived: true },
    );
  });

  it("create leaves position unset so the service appends", async () => {
    await run(
      "statuses",
      "create",
      "Blocked",
      "--type",
      "paused",
      "--color",
      "#B45309",
    );

    expect(createProjectStatus).toHaveBeenCalledWith(expect.anything(), {
      name: "Blocked",
      type: "paused",
      color: "#B45309",
    });
  });

  it("create rejects a type outside the enum", async () => {
    await run(
      "statuses",
      "create",
      "Blocked",
      "--type",
      "stalled",
      "--color",
      "#B45309",
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --type"),
    );
    expect(createProjectStatus).not.toHaveBeenCalled();
  });

  it("create rejects a position with trailing junk", async () => {
    await run(
      "statuses",
      "create",
      "Blocked",
      "--type",
      "paused",
      "--color",
      "#B45309",
      "--position",
      "1O",
    );

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --position"),
    );
    expect(createProjectStatus).not.toHaveBeenCalled();
  });

  it("update maps --not-indefinite to false", async () => {
    await run("statuses", "update", "Done", "--not-indefinite");

    expect(updateProjectStatus).toHaveBeenCalledWith(
      expect.anything(),
      "status-uuid-1",
      { indefinite: false },
    );
  });

  it("update refuses contradictory indefinite flags", async () => {
    await run("statuses", "update", "Done", "--indefinite", "--not-indefinite");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be combined with --not-indefinite"),
    );
    expect(updateProjectStatus).not.toHaveBeenCalled();
  });

  it("archive reassigns before archiving when --reassign-to is given", async () => {
    await run("statuses", "archive", "Done", "--reassign-to", "In Review");

    expect(reassignProjectStatus).toHaveBeenCalledWith(
      expect.anything(),
      "status-uuid-1",
      "status-uuid-2",
    );
    expect(archiveProjectStatus).toHaveBeenCalledWith(
      expect.anything(),
      "status-uuid-1",
    );
  });

  it("archive says where the projects went when it fails after reassigning", async () => {
    vi.mocked(archiveProjectStatus).mockRejectedValueOnce(
      new Error("Cannot archive the last status of this type"),
    );

    await run("statuses", "archive", "Done", "--reassign-to", "In Review");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('In Review\\" and were not moved back'),
    );
  });

  it("archive reports a plain failure when nothing was reassigned", async () => {
    vi.mocked(archiveProjectStatus).mockRejectedValueOnce(
      new Error("Cannot archive the last status of this type"),
    );

    await run("statuses", "archive", "Done");

    expect(console.error).toHaveBeenCalledWith(
      expect.not.stringContaining("were not moved back"),
    );
  });

  it("archive refuses to reassign a status onto itself", async () => {
    await run("statuses", "archive", "Done", "--reassign-to", "Done");

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must name a different status"),
    );
    expect(reassignProjectStatus).not.toHaveBeenCalled();
    expect(archiveProjectStatus).not.toHaveBeenCalled();
  });

  it("archive skips reassignment when the flag is absent", async () => {
    await run("statuses", "archive", "Done");

    expect(reassignProjectStatus).not.toHaveBeenCalled();
    expect(archiveProjectStatus).toHaveBeenCalledWith(
      expect.anything(),
      "status-uuid-1",
    );
  });

  it("unarchive resolves archived statuses", async () => {
    await run("statuses", "unarchive", "Done");

    expect(resolveProjectStatusId).toHaveBeenCalledWith(
      expect.anything(),
      "Done",
      { includeArchived: true },
    );
    expect(unarchiveProjectStatus).toHaveBeenCalledWith(
      expect.anything(),
      "status-uuid-1",
    );
  });
});
