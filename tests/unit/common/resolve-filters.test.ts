import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphQLClient } from "../../../src/client/graphql-client.js";
import type { LinearSdkClient } from "../../../src/client/linear-client.js";
import type { CommandContext } from "../../../src/common/context.js";
import { resolveFilterOptions } from "../../../src/common/resolve-filters.js";

vi.mock("../../../src/resolvers/team-resolver.js", () => ({
  resolveTeamId: vi.fn().mockResolvedValue("team-uuid"),
}));
vi.mock("../../../src/resolvers/user-resolver.js", () => ({
  resolveUserId: vi.fn().mockResolvedValue("user-uuid"),
}));
vi.mock("../../../src/resolvers/project-resolver.js", () => ({
  resolveProjectId: vi.fn().mockResolvedValue("project-uuid"),
}));
vi.mock("../../../src/resolvers/status-resolver.js", () => ({
  resolveStatusId: vi.fn().mockResolvedValue("status-uuid"),
}));
vi.mock("../../../src/resolvers/label-resolver.js", () => ({
  resolveLabelIds: vi.fn().mockResolvedValue(["label-uuid-1", "label-uuid-2"]),
}));
vi.mock("../../../src/resolvers/cycle-resolver.js", () => ({
  resolveCycleId: vi.fn().mockResolvedValue("cycle-uuid"),
}));
vi.mock("../../../src/resolvers/issue-resolver.js", () => ({
  resolveIssueId: vi.fn().mockResolvedValue("issue-uuid"),
}));
vi.mock("../../../src/resolvers/milestone-resolver.js", () => ({
  resolveMilestoneId: vi.fn().mockResolvedValue("milestone-uuid"),
}));

function mockContext(): CommandContext {
  return {
    gql: {} as unknown as GraphQLClient,
    sdk: {} as unknown as LinearSdkClient,
  };
}

describe("resolveFilterOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty options when no flags provided", async () => {
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {});
    expect(result).toEqual({
      priority: undefined,
      estimate: undefined,
      dueBefore: undefined,
      dueAfter: undefined,
      createdAfter: undefined,
      createdBefore: undefined,
      completedAfter: undefined,
      completedBefore: undefined,
      updatedAfter: undefined,
      updatedBefore: undefined,
      hasBlockers: undefined,
      isBlocking: undefined,
    });
  });

  it("resolves team ID via resolver", async () => {
    const { resolveTeamId } = await import(
      "../../../src/resolvers/team-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { team: "ENG" });
    expect(resolveTeamId).toHaveBeenCalledWith(ctx.sdk, "ENG");
    expect(result.teamId).toBe("team-uuid");
  });

  it("resolves assignee ID via resolver", async () => {
    const { resolveUserId } = await import(
      "../../../src/resolvers/user-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { assignee: "alice" });
    expect(resolveUserId).toHaveBeenCalledWith(ctx.sdk, "alice");
    expect(result.assigneeId).toBe("user-uuid");
  });

  it("resolves creator ID via resolver", async () => {
    const { resolveUserId } = await import(
      "../../../src/resolvers/user-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { creator: "bob" });
    expect(resolveUserId).toHaveBeenCalledWith(ctx.sdk, "bob");
    expect(result.creatorId).toBe("user-uuid");
  });

  it("resolves project ID via resolver", async () => {
    const { resolveProjectId } = await import(
      "../../../src/resolvers/project-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { project: "Backend" });
    expect(resolveProjectId).toHaveBeenCalledWith(ctx.sdk, "Backend");
    expect(result.projectId).toBe("project-uuid");
  });

  it("resolves comma-separated status IDs with team dependency", async () => {
    const { resolveStatusId } = await import(
      "../../../src/resolvers/status-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      team: "ENG",
      status: "Todo,In Progress",
    });
    expect(resolveStatusId).toHaveBeenCalledWith(ctx.sdk, "Todo", "team-uuid");
    expect(resolveStatusId).toHaveBeenCalledWith(
      ctx.sdk,
      "In Progress",
      "team-uuid",
    );
    expect(result.stateIds).toEqual(["status-uuid", "status-uuid"]);
  });

  it("resolves comma-separated label IDs", async () => {
    const { resolveLabelIds } = await import(
      "../../../src/resolvers/label-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { label: "Bug,Critical" });
    expect(resolveLabelIds).toHaveBeenCalledWith(ctx.sdk, ["Bug", "Critical"]);
    expect(result.labelIds).toEqual(["label-uuid-1", "label-uuid-2"]);
  });

  it("resolves cycle ID with resolved team ID", async () => {
    const { resolveCycleId } = await import(
      "../../../src/resolvers/cycle-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      team: "ENG",
      cycle: "Sprint 1",
    });
    expect(resolveCycleId).toHaveBeenCalledWith(
      ctx.sdk,
      "Sprint 1",
      "team-uuid",
    );
    expect(result.cycleId).toBe("cycle-uuid");
  });

  it("resolves parent issue ID", async () => {
    const { resolveIssueId } = await import(
      "../../../src/resolvers/issue-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { parent: "ENG-123" });
    expect(resolveIssueId).toHaveBeenCalledWith(ctx.sdk, "ENG-123");
    expect(result.parentId).toBe("issue-uuid");
  });

  it("resolves milestone ID with resolved project ID", async () => {
    const { resolveMilestoneId } = await import(
      "../../../src/resolvers/milestone-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      project: "Backend",
      milestone: "v1.0",
    });
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      ctx.gql,
      ctx.sdk,
      "v1.0",
      "project-uuid",
    );
    expect(result.milestoneId).toBe("milestone-uuid");
  });

  it("parses priority string to number", async () => {
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { priority: "2" });
    expect(result.priority).toBe(2);
  });

  it("parses estimate string to number", async () => {
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, { estimate: "5" });
    expect(result.estimate).toBe(5);
  });

  it("passes through date values unchanged", async () => {
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      dueBefore: "2025-12-31",
      dueAfter: "2025-01-01",
      createdAfter: "2025-02-01",
      createdBefore: "2025-11-01",
    });
    expect(result.dueBefore).toBe("2025-12-31");
    expect(result.dueAfter).toBe("2025-01-01");
    expect(result.createdAfter).toBe("2025-02-01");
    expect(result.createdBefore).toBe("2025-11-01");
  });

  it("passes through boolean flags", async () => {
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      hasBlockers: true,
      isBlocking: true,
    });
    expect(result.hasBlockers).toBe(true);
    expect(result.isBlocking).toBe(true);
  });

  // Validation error cases
  it("throws on invalid priority string", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { priority: "abc" }),
    ).rejects.toThrow("--priority");
  });

  it("throws on decimal priority", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { priority: "1.5" }),
    ).rejects.toThrow("--priority");
  });

  it("throws on out-of-range priority", async () => {
    const ctx = mockContext();
    await expect(resolveFilterOptions(ctx, { priority: "5" })).rejects.toThrow(
      "priority",
    );
  });

  it("throws on invalid estimate string", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { estimate: "abc" }),
    ).rejects.toThrow("--estimate");
  });

  it("throws on partially numeric estimate", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { estimate: "2abc" }),
    ).rejects.toThrow("--estimate");
  });

  it("throws on negative estimate", async () => {
    const ctx = mockContext();
    await expect(resolveFilterOptions(ctx, { estimate: "-1" })).rejects.toThrow(
      "estimate",
    );
  });

  it("throws when --status used without --team", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { status: "In Progress" }),
    ).rejects.toThrow("--team");
  });

  it("allows status UUID without --team", async () => {
    const { resolveTeamId } = await import(
      "../../../src/resolvers/team-resolver.js"
    );
    const { resolveStatusId } = await import(
      "../../../src/resolvers/status-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      status: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(resolveStatusId).toHaveBeenCalledWith(
      ctx.sdk,
      "550e8400-e29b-41d4-a716-446655440000",
      undefined,
    );
    expect(result.stateIds).toEqual(["status-uuid"]);
  });

  it("throws on malformed status list before making resolver calls", async () => {
    const { resolveTeamId } = await import(
      "../../../src/resolvers/team-resolver.js"
    );
    const { resolveStatusId } = await import(
      "../../../src/resolvers/status-resolver.js"
    );
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { team: "ENG", status: "Todo,,Done" }),
    ).rejects.toThrow("empty");
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(resolveStatusId).not.toHaveBeenCalled();
  });

  it("throws on malformed label list before making resolver calls", async () => {
    const { resolveLabelIds } = await import(
      "../../../src/resolvers/label-resolver.js"
    );
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { label: "bug, ,ux" }),
    ).rejects.toThrow("empty");
    expect(resolveLabelIds).not.toHaveBeenCalled();
  });

  it("throws when --cycle used without --team", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { cycle: "Sprint 1" }),
    ).rejects.toThrow("--team");
  });

  it("allows cycle UUID without --team", async () => {
    const { resolveTeamId } = await import(
      "../../../src/resolvers/team-resolver.js"
    );
    const { resolveCycleId } = await import(
      "../../../src/resolvers/cycle-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      cycle: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(resolveTeamId).not.toHaveBeenCalled();
    expect(resolveCycleId).toHaveBeenCalledWith(
      ctx.sdk,
      "550e8400-e29b-41d4-a716-446655440001",
      undefined,
    );
    expect(result.cycleId).toBe("cycle-uuid");
  });

  it("throws when --milestone used without --project", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { milestone: "v1.0" }),
    ).rejects.toThrow("--project");
  });

  it("allows milestone UUID without --project", async () => {
    const { resolveProjectId } = await import(
      "../../../src/resolvers/project-resolver.js"
    );
    const { resolveMilestoneId } = await import(
      "../../../src/resolvers/milestone-resolver.js"
    );
    const ctx = mockContext();
    const result = await resolveFilterOptions(ctx, {
      milestone: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(resolveProjectId).not.toHaveBeenCalled();
    expect(resolveMilestoneId).toHaveBeenCalledWith(
      ctx.gql,
      ctx.sdk,
      "550e8400-e29b-41d4-a716-446655440002",
      undefined,
    );
    expect(result.milestoneId).toBe("milestone-uuid");
  });

  it("throws on contradictory date range", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, {
        dueAfter: "2025-12-31",
        dueBefore: "2025-01-01",
      }),
    ).rejects.toThrow("due date");
  });

  it("throws on invalid due date format with flag-specific message", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { dueBefore: "not-a-date" }),
    ).rejects.toThrow("--due-before");
  });

  it("throws on invalid created date format with flag-specific message", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { createdBefore: "not-a-date" }),
    ).rejects.toThrow("--created-before");
  });

  it("throws on impossible completed date with flag-specific message", async () => {
    const ctx = mockContext();
    await expect(
      resolveFilterOptions(ctx, { completedAfter: "2025-02-30" }),
    ).rejects.toThrow("--completed-after");
  });
});
