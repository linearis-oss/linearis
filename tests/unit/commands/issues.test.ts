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

vi.mock("../../../src/resolvers/issue-batch-resolver.js", () => ({
  resolveIssueCreateRefs: vi.fn().mockResolvedValue({
    teamId: "resolved-team-uuid",
    projectId: "resolved-project-uuid",
    labelIds: ["resolved-label-uuid"],
    parentId: "resolved-parent-uuid",
    projectMilestoneId: "resolved-milestone-uuid",
  }),
  resolveIssueUpdateRefs: vi.fn().mockResolvedValue({
    projectId: "resolved-project-uuid",
    labelIds: ["resolved-label-uuid"],
    currentLabelIds: ["current-label-uuid"],
    parentId: "resolved-parent-uuid",
    projectMilestoneId: "resolved-milestone-uuid",
  }),
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
import {
  resolveIssueCreateRefs,
  resolveIssueUpdateRefs,
} from "../../../src/resolvers/issue-batch-resolver.js";
import { resolveUserId } from "../../../src/resolvers/user-resolver.js";
import {
  createIssue,
  listIssues,
  searchIssues,
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

describe("issues create batches refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("issues create batches team/project/labels/parent/milestone refs", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
      "--project",
      "Platform",
      "--labels",
      "bug,backend",
      "--parent-ticket",
      "ENG-42",
      "--project-milestone",
      "Q2",
    ]);

    expect(resolveIssueCreateRefs).toHaveBeenCalledWith(expect.anything(), {
      team: "ENG",
      project: "Platform",
      labels: ["bug", "backend"],
      parentTicket: "ENG-42",
      projectMilestone: "Q2",
    });
    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamId: "resolved-team-uuid",
        projectId: "resolved-project-uuid",
        labelIds: ["resolved-label-uuid"],
        parentId: "resolved-parent-uuid",
        projectMilestoneId: "resolved-milestone-uuid",
      }),
    );
  });
});

describe("issues create --estimate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes estimate as integer to createIssue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Estimate test",
      "--team",
      "ENG",
      "--estimate",
      "5",
    ]);

    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estimate: 5 }),
    );
  });

  it("passes estimate 0 through to createIssue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Zero estimate",
      "--team",
      "ENG",
      "--estimate",
      "0",
    ]);

    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ estimate: 0 }),
    );
  });

  it("does not set estimate when --estimate is omitted", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "No estimate",
      "--team",
      "ENG",
    ]);

    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ estimate: expect.anything() }),
    );
  });
});

describe("issues create --due-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes dueDate in create input", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
      "--due-date",
      "2025-01-15",
    ]);

    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ dueDate: "2025-01-15" }),
    );
  });

  it("does not include dueDate when --due-date is omitted", async () => {
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

    expect(createIssue).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ dueDate: expect.anything() }),
    );
  });

  it("rejects invalid date format", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Fix login bug",
      "--team",
      "ENG",
      "--due-date",
      "not-a-date",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid due date format"),
    );
  });
});

describe("issues update --estimate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes estimate as integer to updateIssue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--estimate",
      "8",
    ]);

    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({ estimate: 8 }),
    );
  });

  it("clears estimate with --clear-estimate", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--clear-estimate",
    ]);

    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({ estimate: null }),
    );
  });

  it("rejects --estimate and --clear-estimate together", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--estimate",
      "5",
      "--clear-estimate",
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("rejects --estimate 0 and --clear-estimate together", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--estimate",
      "0",
      "--clear-estimate",
    ]);

    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe("issues update --due-date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes dueDate in update input", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--due-date",
      "2025-02-01",
    ]);

    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({ dueDate: "2025-02-01" }),
    );
  });

  it("clears dueDate with --clear-due-date", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--clear-due-date",
    ]);

    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({ dueDate: null }),
    );
  });

  it("throws when --due-date and --clear-due-date are both provided", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--due-date",
      "2025-02-01",
      "--clear-due-date",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Cannot use --due-date and --clear-due-date together",
      ),
    );
  });

  it("rejects invalid date format", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--due-date",
      "2025-13-01",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid due date"),
    );
  });
});

describe("issues list/search filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("passes resolved filters to issues list", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "list",
      "--team",
      "ENG",
      "--status",
      "Todo",
      "--limit",
      "10",
      "--after",
      "cursor-1",
    ]);

    expect(listIssues).toHaveBeenCalledWith(
      expect.anything(),
      { limit: 10, after: "cursor-1" },
      {
        and: [
          { team: { id: { eq: "resolved-team-uuid" } } },
          { state: { id: { in: ["resolved-status-uuid"] } } },
        ],
      },
    );
  });

  it("passes resolved filters to issues search", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "search",
      "authentication bug",
      "--team",
      "ENG",
      "--status",
      "Todo",
      "--limit",
      "10",
    ]);

    expect(searchIssues).toHaveBeenCalledWith(
      expect.anything(),
      "authentication bug",
      { limit: 10, after: undefined },
      {
        and: [
          { team: { id: { eq: "resolved-team-uuid" } } },
          { state: { id: { in: ["resolved-status-uuid"] } } },
        ],
      },
    );
  });

  it("keeps issues list --query as a deprecated search compatibility path", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "list",
      "--query",
      "authentication bug",
      "--team",
      "ENG",
      "--status",
      "Todo",
      "--limit",
      "10",
      "--after",
      "cursor-1",
    ]);

    expect(searchIssues).toHaveBeenCalledWith(
      expect.anything(),
      "authentication bug",
      { limit: 10, after: "cursor-1" },
      {
        and: [
          { team: { id: { eq: "resolved-team-uuid" } } },
          { state: { id: { in: ["resolved-status-uuid"] } } },
        ],
      },
    );
    expect(listIssues).not.toHaveBeenCalled();
  });
});

describe("issues update batches refs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("issues update batches project/labels/parent/milestone refs", async () => {
    const program = createProgram();

    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--project",
      "Platform",
      "--labels",
      "bug",
      "--parent-ticket",
      "ENG-99",
      "--project-milestone",
      "Q3",
    ]);

    expect(resolveIssueUpdateRefs).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        project: "Platform",
        labels: ["bug"],
        parentTicket: "ENG-99",
        projectMilestone: "Q3",
      }),
    );
  });

  it("issues update label add still merges current labels with resolved label IDs", async () => {
    vi.mocked(resolveIssueUpdateRefs).mockResolvedValueOnce({
      labelIds: ["resolved-label-uuid"],
      currentLabelIds: ["current-label-uuid"],
    });

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--labels",
      "bug",
      "--label-mode",
      "add",
    ]);

    expect(updateIssue).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      expect.objectContaining({
        labelIds: ["current-label-uuid", "resolved-label-uuid"],
      }),
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
