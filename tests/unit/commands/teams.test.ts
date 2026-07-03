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
}));

import { setupTeamsCommands } from "../../../src/commands/teams.js";
import { outputSuccess } from "../../../src/common/output.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";
import { getTeam, listTeams } from "../../../src/services/team-service.js";

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
