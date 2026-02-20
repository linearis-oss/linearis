// tests/unit/commands/issues.test.ts
import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all external dependencies before importing the module under test
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

vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("resolved-user-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/resolvers/issue-resolver.js", () => ({
  resolveIssueId: vi.fn().mockResolvedValue("resolved-issue-uuid"),
}));

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
}));

vi.mock("../../../src/resolvers/label-resolver.js", () => ({
  resolveLabelIds: vi.fn().mockResolvedValue(["resolved-label-uuid"]),
}));

vi.mock("../../../src/resolvers/milestone-resolver.js", () => ({
  resolveMilestoneId: vi.fn().mockResolvedValue("resolved-milestone-uuid"),
}));

vi.mock("../../../src/resolvers/cycle-resolver.js", () => ({
  resolveCycleId: vi.fn().mockResolvedValue("resolved-cycle-uuid"),
}));

vi.mock("../../../src/resolvers/status-resolver.js", () => ({
  resolveStatusId: vi.fn().mockResolvedValue("resolved-status-uuid"),
}));

vi.mock("../../../src/services/issue-service.js", () => ({
  createIssue: vi.fn().mockResolvedValue({ id: "new-issue-id" }),
  updateIssue: vi.fn().mockResolvedValue({ id: "updated-issue-id" }),
  getIssue: vi.fn().mockResolvedValue({
    id: "resolved-issue-uuid",
    team: { id: "team-uuid", key: "ENG" },
    project: { name: "My Project" },
    labels: { nodes: [] },
  }),
  getIssueByIdentifier: vi.fn(),
  listIssues: vi.fn().mockResolvedValue([]),
  searchIssues: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/services/issue-relation-service.js", () => ({
  createIssueRelation: vi.fn(),
  deleteIssueRelation: vi.fn(),
  findIssueRelation: vi.fn(),
}));

import { setupIssuesCommands } from "../../../src/commands/issues.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  createIssue,
  updateIssue,
} from "../../../src/services/issue-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupIssuesCommands(program);
  return program;
}

describe("issues create --assignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("resolves assignee name to UUID before creating issue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
      "--assignee",
      "John Doe",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(expect.anything(), "John Doe");
    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assigneeId: "resolved-user-uuid" }),
    );
  });

  it("resolves assignee email to UUID before creating issue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
      "--assignee",
      "john@example.com",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(
      expect.anything(),
      "john@example.com",
    );
    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assigneeId: "resolved-user-uuid" }),
    );
  });

  it("does not call resolveUserId when --assignee is omitted", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
    ]);

    expect(resolveUserId).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ assigneeId: expect.anything() }),
    );
  });
});

describe("issues update --assignee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("resolves assignee name to UUID before updating issue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--assignee",
      "Jane Smith",
    ]);

    expect(resolveUserId).toHaveBeenCalledWith(expect.anything(), "Jane Smith");
    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({ assigneeId: "resolved-user-uuid" }),
    );
  });

  it("does not call resolveUserId when --assignee is omitted", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--title",
      "New title",
    ]);

    expect(resolveUserId).not.toHaveBeenCalled();
  });
});
