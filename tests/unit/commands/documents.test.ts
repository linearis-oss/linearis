import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/common/context.js", () => ({
  createContext: vi.fn(() => ({
    gql: { request: vi.fn() },
    sdk: { sdk: {} },
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

vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("resolved-project-uuid"),
}));

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("resolved-team-uuid"),
}));

vi.mock("../../../src/services/attachment-service.js", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../src/services/document-service.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/services/document-service.js")
    >();
  return {
    ...actual,
    createDocument: vi.fn().mockResolvedValue({
      id: "doc-1",
      title: "Runbook",
      url: "https://linear.app/example/document/runbook-abc123",
    }),
    deleteDocument: vi.fn().mockResolvedValue({ id: "doc-1", success: true }),
    getDocument: vi.fn().mockResolvedValue({ id: "doc-1", title: "Runbook" }),
    listDocuments: vi.fn().mockResolvedValue({
      nodes: [{ id: "doc-1", title: "Runbook" }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }),
    updateDocument: vi
      .fn()
      .mockResolvedValue({ id: "doc-1", title: "Runbook" }),
  };
});

import { setupDocumentsCommands } from "../../../src/commands/documents.js";
import { resolveIssueId } from "../../../src/resolvers/issue-resolver.js";
import { resolveTeamId } from "../../../src/resolvers/team-resolver.js";
import { listAttachments } from "../../../src/services/attachment-service.js";
import {
  createDocument,
  listDocuments,
} from "../../../src/services/document-service.js";

function createProgram(): Command {
  const program = new Command();
  program.option("--api-token <token>");
  setupDocumentsCommands(program);
  return program;
}

describe("documents list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("uses the document issue filter for --issue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "documents",
      "list",
      "--issue",
      "ENG-42",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(listDocuments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: { issue: { id: { eq: "resolved-issue-uuid" } } },
      }),
    );
  });

  it("includes legacy document URL attachments in the issue filter", async () => {
    vi.mocked(listAttachments).mockResolvedValueOnce([
      {
        id: "att-1",
        title: "Runbook",
        subtitle: null,
        url: "https://linear.app/example/document/runbook-abc123",
        sourceType: null,
        metadata: {},
        source: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "documents",
      "list",
      "--issue",
      "ENG-42",
    ]);

    expect(listDocuments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        filter: {
          or: [
            { issue: { id: { eq: "resolved-issue-uuid" } } },
            { slugId: { eq: "abc123" } },
          ],
        },
      }),
    );
  });
});

describe("documents create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("passes issueId directly when --issue is provided", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "documents",
      "create",
      "--title",
      "Runbook",
      "--issue",
      "ENG-42",
    ]);

    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(createDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: "Runbook",
        issueId: "resolved-issue-uuid",
      }),
    );
  });

  it("accepts --attach-to as an alias for --issue", async () => {
    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "documents",
      "create",
      "--title",
      "Runbook",
      "--team",
      "ENG",
      "--attach-to",
      "ENG-42",
    ]);

    expect(resolveTeamId).toHaveBeenCalledWith(expect.anything(), "ENG");
    expect(resolveIssueId).toHaveBeenCalledWith(expect.anything(), "ENG-42");
    expect(createDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        teamId: "resolved-team-uuid",
        issueId: "resolved-issue-uuid",
      }),
    );
  });

  it("rejects combining --issue and --attach-to before creating", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const program = createProgram();
    await program.parseAsync([
      "node",
      "test",
      "documents",
      "create",
      "--title",
      "Runbook",
      "--issue",
      "ENG-42",
      "--attach-to",
      "ENG-43",
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(
        "Invalid --attach-to: cannot be combined with --issue",
      ),
    );
    expect(createDocument).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
