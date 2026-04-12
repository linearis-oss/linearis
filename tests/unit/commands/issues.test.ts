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
  getIssueWithAttachments: vi.fn().mockResolvedValue({
    id: "resolved-issue-uuid",
    attachments: { nodes: [{ id: "att-1", title: "PR #42" }] },
  }),
  getIssueByIdentifierWithAttachments: vi.fn(),
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
  getIssueByIdentifierWithAttachments,
  getIssueWithAttachments,
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

describe("issues read --with-attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("calls getIssueWithAttachments when flag is set with UUID", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "read",
      "550e8400-e29b-41d4-a716-446655440000",
      "--with-attachments",
    ]);

    expect(getIssueWithAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "550e8400-e29b-41d4-a716-446655440000",
    );
  });

  it("calls getIssueByIdentifierWithAttachments when flag is set with identifier", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "read",
      "ENG-42",
      "--with-attachments",
    ]);

    expect(getIssueByIdentifierWithAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "ENG",
      42,
    );
  });
});

describe("issues create relations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("creates single relation", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103",
    ]);
    const { createIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(createIssueRelation).toHaveBeenCalledTimes(1);
    expect(createIssueRelation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "blocks" }),
    );
  });

  it("creates multiple relations of same type", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103,DAT-104",
    ]);
    const { createIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(createIssueRelation).toHaveBeenCalledTimes(2);
  });

  it("creates multiple relations of different types", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103",
      "--relates-to",
      "DAT-913",
    ]);
    const { createIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(createIssueRelation).toHaveBeenCalledTimes(2);
  });

  it("errors on cross-flag duplicate target", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103",
      "--relates-to",
      "DAT-103",
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("appears in multiple relation flags"),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("deduplicates intra-flag duplicates silently", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103,DAT-103",
    ]);
    const { createIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(createIssueRelation).toHaveBeenCalledTimes(1);
  });

  it("errors when remove-relation mixed with add flags", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "DAT-103",
      "--remove-relation",
      "DAT-913",
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Cannot mix add and remove relation flags"),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("errors on empty relation value", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "create",
      "Title",
      "--team",
      "ENG",
      "--blocks",
      "",
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("must not be empty"),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});

describe("issues update relations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  });

  it("removes single relation", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--remove-relation",
      "DAT-103",
    ]);
    const { deleteIssueRelation, findIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(findIssueRelation).toHaveBeenCalledTimes(1);
    expect(deleteIssueRelation).toHaveBeenCalledTimes(1);
  });

  it("removes multiple relations", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--remove-relation",
      "DAT-103,DAT-913",
    ]);
    const { deleteIssueRelation, findIssueRelation } = await import(
      "../../../src/services/issue-relation-service.js"
    );
    expect(findIssueRelation).toHaveBeenCalledTimes(2);
    expect(deleteIssueRelation).toHaveBeenCalledTimes(2);
  });

  it("errors on cross-flag duplicate in update", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--blocks",
      "DAT-103",
      "--relates-to",
      "DAT-103",
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("appears in multiple relation flags"),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it("errors when remove-relation mixed with add flags in update", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "issues",
      "update",
      "ENG-42",
      "--blocks",
      "DAT-103",
      "--remove-relation",
      "DAT-913",
    ]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Cannot mix add and remove relation flags"),
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
