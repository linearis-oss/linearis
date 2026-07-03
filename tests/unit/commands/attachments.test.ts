import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: {},
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

vi.mock("../../../src/resolvers/issue-resolver.js", () => ({
  resolveIssueId: vi.fn().mockResolvedValue("resolved-issue-uuid"),
}));

vi.mock(
  "../../../src/services/attachment-service.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../src/services/attachment-service.js")
      >();
    return {
      ...actual,
      createAttachment: vi.fn().mockResolvedValue({
        id: "att-1",
        title: "Test",
        url: "https://example.com",
      }),
      deleteAttachment: vi.fn().mockResolvedValue({
        id: "att-1",
        success: true,
      }),
      listAttachments: vi
        .fn()
        .mockResolvedValue([
          { id: "att-1", title: "PR #42", sourceType: "github" },
        ]),
    };
  },
);

import { setupAttachmentsCommands } from "../../../src/commands/attachments.js";
import { resolveIssueId } from "../../../src/resolvers/issue-resolver.js";
import {
  createAttachment,
  deleteAttachment,
  listAttachments,
} from "../../../src/services/attachment-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupAttachmentsCommands(program);
  return program;
}

describe("attachments list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("resolves issue and lists attachments", async () => {
    const program = createProgram();
    await program.parseAsync(["node", "test", "attachments", "list", "ENG-42"]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(listAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      undefined,
    );
  });

  it("accepts --issue as an alias for the issue argument", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "list",
      "--issue",
      "ENG-42",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(listAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      undefined,
    );
  });

  it("rejects combining positional issue and --issue", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "list",
      "ENG-42",
      "--issue",
      "ENG-43",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid --issue: cannot be combined with positional issue",
      ),
    );
    expect(listAttachments).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });

  it("passes source-type filter", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "list",
      "ENG-42",
      "--source-type",
      "github",
    ]);

    expect(listAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      { sourceType: { eq: "github" } },
    );
  });

  it("combines multiple filters with AND", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "list",
      "ENG-42",
      "--source-type",
      "github",
      "--title",
      "Fix bug",
      "--created-after",
      "2024-01-01",
      "--created-before",
      "2024-12-31",
    ]);

    expect(listAttachments).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-issue-uuid",
      {
        and: [
          { sourceType: { eq: "github" } },
          { title: { eqIgnoreCase: "Fix bug" } },
          { createdAt: { gte: "2024-01-01" } },
          { createdAt: { lt: "2024-12-31" } },
        ],
      },
    );
  });
});

describe("attachments create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("resolves issue and creates attachment", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "create",
      "ENG-42",
      "--title",
      "My PR",
      "--url",
      "https://github.com/org/repo/pull/1",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(createAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        issueId: "resolved-issue-uuid",
        title: "My PR",
        url: "https://github.com/org/repo/pull/1",
      }),
    );
  });

  it("passes optional subtitle", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "create",
      "ENG-42",
      "--title",
      "My PR",
      "--url",
      "https://github.com/org/repo/pull/1",
      "--subtitle",
      "merged pull request",
    ]);

    expect(createAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subtitle: "merged pull request",
      }),
    );
  });

  it("accepts --issue as an alias for the issue argument", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "create",
      "--issue",
      "ENG-42",
      "--title",
      "My PR",
      "--url",
      "https://github.com/org/repo/pull/1",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(createAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        issueId: "resolved-issue-uuid",
        title: "My PR",
        url: "https://github.com/org/repo/pull/1",
      }),
    );
  });

  it("passes optional comment and icon URL", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "create",
      "ENG-42",
      "--title",
      "Build",
      "--url",
      "https://ci.example.com/build/1",
      "--comment",
      "Build is green",
      "--icon-url",
      "https://ci.example.com/icon.png",
    ]);

    expect(createAttachment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        commentBody: "Build is green",
        iconUrl: "https://ci.example.com/icon.png",
      }),
    );
  });
});

describe("attachments delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("deletes attachment by UUID", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "attachments",
      "delete",
      "att-uuid-123",
    ]);

    expect(deleteAttachment).toHaveBeenCalledWith(
      expect.anything(),
      "att-uuid-123",
    );
  });
});
