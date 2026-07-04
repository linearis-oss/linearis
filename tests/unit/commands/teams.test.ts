import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
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

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/services/team-service.js", () => ({
  listTeams: vi.fn().mockResolvedValue({
    nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
    pageInfo: { hasNextPage: false, endCursor: null },
  }),
  getTeam: vi.fn().mockResolvedValue({
    id: "team-1",
    key: "ENG",
    validEstimates: [
      { value: 1, label: "1" },
      { value: 2, label: "2" },
      { value: 3, label: "3" },
      { value: 5, label: "5" },
      { value: 8, label: "8" },
    ],
    estimationSource: "self",
  }),
  createTeam: vi
    .fn()
    .mockResolvedValue({ id: "team-new", key: "NEW", name: "New Team" }),
  updateTeam: vi
    .fn()
    .mockResolvedValue({ id: "team-1", key: "ENG", name: "Renamed" }),
  listTeamMembers: vi.fn().mockResolvedValue({
    nodes: [{ id: "m1", owner: true, user: { id: "user-1", name: "Alice" } }],
  }),
  addTeamMember: vi.fn().mockResolvedValue({
    id: "m1",
    owner: false,
    user: { id: "user-1", name: "Alice" },
  }),
  removeTeamMember: vi.fn().mockResolvedValue({ id: "m1", success: true }),
}));

import { setupTeamsCommands } from "../../../src/commands/teams.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  addTeamMember,
  createTeam,
  getTeam,
  listTeamMembers,
  listTeams,
  removeTeamMember,
  updateTeam,
} from "../../../src/services/team-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupTeamsCommands(program);
  return program;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

describe("teams read", () => {
  it("resolves team id and outputs team detail", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "teams", "read", "ENG"]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(getTeam).toHaveBeenCalledWith(expect.anything(), {
      id: "resolved-team-uuid",
    });
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "team-1",
      key: "ENG",
      validEstimates: [
        { value: 1, label: "1" },
        { value: 2, label: "2" },
        { value: 3, label: "3" },
        { value: 5, label: "5" },
        { value: 8, label: "8" },
      ],
      estimationSource: "self",
    });
  });
});

describe("teams list", () => {
  it("uses listTeams path and outputs nodes", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "teams", "list"]);

    expect(listTeams).toHaveBeenCalledWith(expect.anything(), {
      limit: 50,
      after: undefined,
    });
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
  });
});

describe("teams create", () => {
  it("builds input from flags and outputs the created team", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "teams",
      "create",
      "New Team",
      "--key",
      "NEW",
      "--private",
      "true",
      "--cycles-enabled",
      "false",
      "--cycle-duration",
      "2",
    ]);

    expect(createTeam).toHaveBeenCalledWith(expect.anything(), {
      name: "New Team",
      key: "NEW",
      private: true,
      cyclesEnabled: false,
      cycleDuration: 2,
    });
    expect(outputSuccess).toHaveBeenCalledWith({
      id: "team-new",
      key: "NEW",
      name: "New Team",
    });
  });

  it("rejects an invalid estimation type", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "teams",
      "create",
      "New Team",
      "--estimation-type",
      "bogus",
    ]);

    expect(createTeam).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe("teams update", () => {
  it("resolves the team and passes only provided fields", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "teams",
      "update",
      "ENG",
      "--name",
      "Renamed",
      "--triage-enabled",
      "true",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(updateTeam).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-team-uuid",
      { name: "Renamed", triageEnabled: true },
    );
  });

  it("errors when no fields are provided", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "teams", "update", "ENG"]);

    expect(updateTeam).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe("teams members", () => {
  it("lists members for the resolved team", async () => {
    const program = createProgram();

    await program.parseAsync(["node", "test", "teams", "members", "ENG"]);

    expect(listTeamMembers).toHaveBeenCalledWith(expect.anything(), {
      id: "resolved-team-uuid",
    });
    expect(outputSuccess).toHaveBeenCalledWith({
      nodes: [{ id: "m1", owner: true, user: { id: "user-1", name: "Alice" } }],
    });
  });
});

describe("teams add-member", () => {
  it("resolves team and user then adds the member", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "teams",
      "add-member",
      "ENG",
      "--user",
      "alice@example.com",
      "--owner",
      "true",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(resolveUserId).toHaveBeenCalledWith(
      expect.anything(),
      "alice@example.com",
    );
    expect(addTeamMember).toHaveBeenCalledWith(expect.anything(), {
      teamId: "resolved-team-uuid",
      userId: "resolved-user-uuid",
      owner: true,
    });
  });
});

describe("teams remove-member", () => {
  it("resolves team and user then removes the member", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "teams",
      "remove-member",
      "ENG",
      "--user",
      "alice@example.com",
    ]);

    expect(removeTeamMember).toHaveBeenCalledWith(expect.anything(), {
      teamId: "resolved-team-uuid",
      userId: "resolved-user-uuid",
    });
    expect(outputSuccess).toHaveBeenCalledWith({ id: "m1", success: true });
  });
});
